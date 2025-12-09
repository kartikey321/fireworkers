import { DBProvider } from './db-provider.js';
import { convert_field_to_value } from './fields.js';
import { query } from './query.js';
import { remove } from './remove.js';
import { set } from './set.js';
import type * as Firestore from './types.js';
import { update } from './update.js';

export const DataFilterType = {
  isEqualTo: 0,
  isNotEqualTo: 1,
  isLessThan: 2,
  isLessThanOrEqualTo: 3,
  isGreaterThan: 4,
  isGreaterThanOrEqualTo: 5,
  arrayContains: 6,
  arrayContainsAny: 7,
  whereIn: 8,
  whereNotIn: 9,
} as const;

export type DataFilterType = (typeof DataFilterType)[keyof typeof DataFilterType];

export const DataFilterWrapperType = {
  or: 0,
  and: 1,
} as const;

export type DataFilterWrapperType = (typeof DataFilterWrapperType)[keyof typeof DataFilterWrapperType];

export interface DataSort {
  field: string;
  ascending: boolean;
}

export class DataFilter {
  fieldName: string;
  value: unknown;
  filterType: DataFilterType;

  constructor(fieldName: string, value: unknown, filterType: DataFilterType) {
    this.fieldName = fieldName;
    this.value = value;
    this.filterType = filterType;
  }
}

export class DataFilterWrapper {
  filterWrapperType: DataFilterWrapperType;
  filters: (DataFilterWrapper | DataFilter)[];

  constructor(filterWrapperType: DataFilterWrapperType, filters: (DataFilterWrapper | DataFilter)[]) {
    this.filterWrapperType = filterWrapperType;
    this.filters = filters;
  }
}

const DOCUMENT_ID_FIELD = '__name__';
const MAX_IN_FILTER_VALUES = 10;

export type FireworkersOperations = {
  set: typeof set;
  update: typeof update;
  remove: typeof remove;
  query: typeof query;
};

const defaultOperations: FireworkersOperations = {
  set,
  update,
  remove,
  query,
};

const FILTER_TYPE_TO_OPERATOR: Record<DataFilterType, Firestore.FieldFilterOp> = {
  [DataFilterType.isEqualTo]: 'EQUAL',
  [DataFilterType.isNotEqualTo]: 'NOT_EQUAL',
  [DataFilterType.isLessThan]: 'LESS_THAN',
  [DataFilterType.isLessThanOrEqualTo]: 'LESS_THAN_OR_EQUAL',
  [DataFilterType.isGreaterThan]: 'GREATER_THAN',
  [DataFilterType.isGreaterThanOrEqualTo]: 'GREATER_THAN_OR_EQUAL',
  [DataFilterType.arrayContains]: 'ARRAY_CONTAINS',
  [DataFilterType.arrayContainsAny]: 'ARRAY_CONTAINS_ANY',
  [DataFilterType.whereIn]: 'IN',
  [DataFilterType.whereNotIn]: 'NOT_IN',
};

const isDataFilterWrapper = (
  filter: DataFilterWrapper | DataFilter
): filter is DataFilterWrapper =>
  (filter as DataFilterWrapper).filterWrapperType !== undefined &&
  Array.isArray((filter as DataFilterWrapper).filters);

export class FireworkersDataHelper<DocumentFields extends Record<string, unknown> = Record<string, unknown>> {
  private readonly db: Firestore.DB | null;
  private readonly collectionSegments: string[];
  private readonly parentDocumentSegments: string[];
  private readonly collectionId: string;
  private readonly operations: FireworkersOperations;

  /**
   * Creates a helper bound to a collection path.
   * @param collectionPath Collection path (e.g. `todos` or `users/userA/todos`).
   * @param db Optional Fireworkers DB instance. If not provided, uses the central DBProvider singleton.
   * @param operations Optional custom operations for testing or extending functionality.
   */
  constructor(
    collectionPath: string | string[],
    db?: Firestore.DB,
    operations: FireworkersOperations = defaultOperations
  ) {
    this.db = db ?? null;
    this.operations = operations;

    const normalizedPath = Array.isArray(collectionPath)
      ? collectionPath
      : collectionPath.split('/');

    this.collectionSegments = normalizedPath.filter((segment) => segment.length);

    if (this.collectionSegments.length === 0)
      throw new Error('Collection path must include at least one segment.');
    if (this.collectionSegments.length % 2 === 0)
      throw new Error('Collection path must end in a collection identifier.');

    this.collectionId = this.collectionSegments.at(-1) as string;
    this.parentDocumentSegments = this.collectionSegments.slice(0, -1);
  }

  /**
   * Gets the DB instance, either from the provided db or from the central DBProvider.
   */
  private getDB(): Firestore.DB {
    if (this.db) {
      return this.db;
    }
    return DBProvider.getInstance().getDB();
  }

  /** Adds or overwrites a document. */
  async addData(data: DocumentFields, docId: string, merge = false): Promise<void> {
    const sanitized = this.replaceUndefinedWithNull(data);
    const documentPath = this.getDocumentPath(docId);

    if (merge) {
      await this.operations.set(this.getDB(), ...documentPath, sanitized, { merge: true });
      return;
    }

    await this.operations.set(this.getDB(), ...documentPath, sanitized);
  }

  /** Returns the documents that match the provided filters. */
  async getData(params?: {
    filters?: (DataFilterWrapper | DataFilter)[];
    limit?: number;
    sortBy?: DataSort;
  }): Promise<DocumentFields[]> {
    const structuredQuery: Firestore.StructuredQuery = {
      from: [{ collectionId: this.collectionId }],
    };

    const where = params?.filters?.length
      ? this.buildFilters(params.filters, DataFilterWrapperType.and)
      : undefined;

    if (where) structuredQuery.where = where;
    if (params?.limit) structuredQuery.limit = params.limit;
    if (params?.sortBy) {
      structuredQuery.orderBy = [
        {
          field: { fieldPath: params.sortBy.field },
          direction: params.sortBy.ascending ? 'ASCENDING' : 'DESCENDING',
        },
      ];
    }

    const documents = await this.operations.query<DocumentFields>(
      this.getDB(),
      structuredQuery,
      ...this.parentDocumentSegments
    );

    return documents.map((doc) => doc.fields as DocumentFields);
  }

  /** Returns a single document or undefined when it does not exist. */
  async getSingleDocument(docId: string): Promise<DocumentFields | undefined> {
    const structuredQuery: Firestore.StructuredQuery = {
      from: [{ collectionId: this.collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: DOCUMENT_ID_FIELD },
          op: 'EQUAL',
          value: this.buildDocumentNameValue(docId),
        },
      },
      limit: 1,
    };

    const [document] = await this.operations.query<DocumentFields>(
      this.getDB(),
      structuredQuery,
      ...this.parentDocumentSegments
    );

    return document?.fields as DocumentFields | undefined;
  }

  /** Partially updates a document. */
  async updateField(docId: string, updateFields: Partial<DocumentFields>): Promise<void> {
    const sanitized = this.replaceUndefinedWithNull(updateFields);
    const documentPath = this.getDocumentPath(docId);

    await this.operations.update(this.db!, ...documentPath, sanitized);
  }

  /** Deletes a document. */
  async deleteDocument(docId: string): Promise<void> {
    const documentPath = this.getDocumentPath(docId);
    await this.operations.remove(this.db!, ...documentPath);
  }

  /** Fetches documents by a bounded list of IDs. */
  async getDocsByIds(ids: string[]): Promise<DocumentFields[]> {
    if (ids.length === 0) return [];
    if (ids.length > MAX_IN_FILTER_VALUES)
      throw new Error(`Firestore supports a maximum of ${MAX_IN_FILTER_VALUES} ids per request.`);

    const structuredQuery: Firestore.StructuredQuery = {
      from: [{ collectionId: this.collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: DOCUMENT_ID_FIELD },
          op: 'IN',
          value: this.buildDocumentNameValue(ids),
        },
      },
    };

    const documents = await this.operations.query<DocumentFields>(
      this.getDB(),
      structuredQuery,
      ...this.parentDocumentSegments
    );

    return documents.map((doc) => doc.fields as DocumentFields);
  }

  private buildFilters(
    filters: (DataFilterWrapper | DataFilter)[],
    wrapperType: DataFilterWrapperType
  ): Firestore.Filter | undefined {
    const builtFilters = filters
      .map((filter) => this.buildFilter(filter))
      .filter((filter): filter is Firestore.Filter => Boolean(filter));

    if (builtFilters.length === 0) return undefined;
    if (builtFilters.length === 1) return builtFilters[0];

    return this.combineFilters(wrapperType, builtFilters);
  }

  private buildFilter(filter: DataFilterWrapper | DataFilter): Firestore.Filter | undefined {
    if (isDataFilterWrapper(filter)) {
      return this.buildFilters(filter.filters, filter.filterWrapperType);
    }

    return {
      fieldFilter: {
        field: { fieldPath: filter.fieldName },
        op: FILTER_TYPE_TO_OPERATOR[filter.filterType],
        value: this.buildFieldValue(filter.fieldName, filter.value),
      },
    };
  }

  private combineFilters(
    type: DataFilterWrapperType,
    filters: Firestore.Filter[]
  ): Firestore.Filter {
    return {
      compositeFilter: {
        op: type === DataFilterWrapperType.and ? 'AND' : 'OR',
        filters,
      },
    };
  }

  private buildFieldValue(fieldName: string, value: unknown): Firestore.Value {
    if (fieldName === DOCUMENT_ID_FIELD) {
      return this.buildDocumentNameValue(value);
    }

    return convert_field_to_value(this.replaceUndefinedWithNull(value));
  }

  private buildDocumentNameValue(value: unknown): Firestore.Value {
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map((entry) => this.buildDocumentNameValue(entry)),
        },
      };
    }

    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('Document id filters require a non-empty string value.');
    }

    const referencePath = this.buildDocumentReferencePath(value);
    return { referenceValue: referencePath };
  }

  private buildDocumentReferencePath(docIdOrPath: string): string {
    const hasPathSeparator = docIdOrPath.includes('/');
    const relativePath = hasPathSeparator
      ? docIdOrPath.replace(/^\/+/, '')
      : [...this.collectionSegments, docIdOrPath].join('/');

    return `projects/${this.getDB().project_id}/databases/(default)/documents/${relativePath}`;
  }

  private getDocumentPath(docId: string): string[] {
    if (!docId || docId.includes('/')) throw new Error('Document ids cannot be empty or contain slashes.');
    return [...this.collectionSegments, docId];
  }

  private replaceUndefinedWithNull<T>(value: T): T {
    if (value === undefined) return null as T;

    if (Array.isArray(value)) {
      return value.map((item) => this.replaceUndefinedWithNull(item)) as T;
    }

    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        this.replaceUndefinedWithNull(val),
      ]);
      return Object.fromEntries(entries) as T;
    }

    return value;
  }
}
