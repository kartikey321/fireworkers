import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DataFilter,
  DataFilterType,
  DataFilterWrapper,
  DataFilterWrapperType,
  FireworkersDataHelper,
  type FireworkersOperations,
} from '../src/data-helper.ts';
import type { DB, StructuredQuery } from '../src/types.js';

type MockCall = unknown[];

type MockOperations = {
  ops: FireworkersOperations;
  calls: {
    set: MockCall[];
    update: MockCall[];
    remove: MockCall[];
    query: MockCall[];
  };
  setQueryResult: (value: unknown) => void;
};

const createMockOperations = (): MockOperations => {
  const calls = {
    set: [] as MockCall[],
    update: [] as MockCall[],
    remove: [] as MockCall[],
    query: [] as MockCall[],
  };

  let queryResult: unknown = [];

  const ops: FireworkersOperations = {
    set: async (...args: MockCall) => {
      calls.set.push(args);
    },
    update: async (...args: MockCall) => {
      calls.update.push(args);
    },
    remove: async (...args: MockCall) => {
      calls.remove.push(args);
      return true;
    },
    query: async (...args: MockCall) => {
      calls.query.push(args);
      return queryResult as never;
    },
  };

  return {
    ops,
    calls,
    setQueryResult(value: unknown) {
      queryResult = value;
    },
  };
};

const db: DB = {
  project_id: 'demo-project',
  jwt: 'fake-jwt',
};

test('addData sanitizes undefined values and forwards merge flag', async () => {
  const mocks = createMockOperations();
  const helper = new FireworkersDataHelper(db, 'todos', mocks.ops);

  await helper.addData(
    {
      title: 'example',
      optional: undefined,
      nested: { name: undefined },
      list: ['a', undefined],
    },
    'doc-1',
    true
  );

  assert.equal(mocks.calls.set.length, 1);
  const [, ...args] = mocks.calls.set[0];
  assert.deepEqual(args, [
    'todos',
    'doc-1',
    {
      title: 'example',
      optional: null,
      nested: { name: null },
      list: ['a', null],
    },
    { merge: true },
  ]);
});

test('getData builds structured queries with filters, sorting, and parent segments', async () => {
  const mocks = createMockOperations();
  mocks.setQueryResult([
    {
      fields: {
        title: 'Doc A',
      },
    },
  ]);

  const helper = new FireworkersDataHelper(
    db,
    ['users', 'user-1', 'todos'],
    mocks.ops
  );

  const filters = [
    new DataFilterWrapper(DataFilterWrapperType.or, [
      new DataFilter('status', 'open', DataFilterType.isEqualTo),
      new DataFilter('priority', 'high', DataFilterType.isEqualTo),
    ]),
  ];

  const result = await helper.getData({
    filters,
    limit: 5,
    sortBy: { field: 'title', ascending: false },
  });

  assert.deepEqual(result, [{ title: 'Doc A' }]);
  assert.equal(mocks.calls.query.length, 1);
  const [, structuredQuery, ...segments] = mocks.calls.query[0] as [
    DB,
    StructuredQuery,
    ...string[]
  ];
  assert.deepEqual(segments, ['users', 'user-1']);
  assert.equal(structuredQuery.limit, 5);
  assert.deepEqual(structuredQuery.orderBy, [
    {
      field: { fieldPath: 'title' },
      direction: 'DESCENDING',
    },
  ]);

  const compositeFilter = structuredQuery.where?.compositeFilter;
  assert.ok(compositeFilter, 'Expected composite filter');
  assert.equal(compositeFilter?.op, 'OR');
  assert.equal(compositeFilter?.filters?.length, 2);
});

test('getSingleDocument filters by reference path and returns fields', async () => {
  const mocks = createMockOperations();
  mocks.setQueryResult([
    {
      fields: { title: 'Single' },
    },
  ]);

  const helper = new FireworkersDataHelper(db, 'todos', mocks.ops);
  const doc = await helper.getSingleDocument('doc-99');

  assert.deepEqual(doc, { title: 'Single' });
  const [, structuredQuery] = mocks.calls.query[0] as [DB, StructuredQuery];
  const referenceValue = structuredQuery.where?.fieldFilter?.value?.referenceValue;
  assert.equal(
    referenceValue,
    'projects/demo-project/databases/(default)/documents/todos/doc-99'
  );
});

test('getDocsByIds enforces REST limit', async () => {
  const mocks = createMockOperations();
  const helper = new FireworkersDataHelper(db, 'todos', mocks.ops);
  const ids = Array.from({ length: 11 }, (_, index) => `doc-${index}`);

  await assert.rejects(() => helper.getDocsByIds(ids), /maximum of 10/i);
});

test('getDocsByIds builds IN query with reference array', async () => {
  const mocks = createMockOperations();
  mocks.setQueryResult([
    { fields: { title: 'A' } },
  ]);
  const helper = new FireworkersDataHelper(db, 'todos', mocks.ops);

  const docs = await helper.getDocsByIds(['doc-1']);
  assert.deepEqual(docs, [{ title: 'A' }]);
  const [, structuredQuery] = mocks.calls.query[0] as [DB, StructuredQuery];
  const arrayValue = structuredQuery.where?.fieldFilter?.value?.arrayValue;
  assert.equal(arrayValue?.values?.length, 1);
  const referenceValue = arrayValue?.values?.[0]?.referenceValue;
  assert.equal(
    referenceValue,
    'projects/demo-project/databases/(default)/documents/todos/doc-1'
  );
});

test('deleteDocument forwards path segments to remove', async () => {
  const mocks = createMockOperations();
  const helper = new FireworkersDataHelper(db, 'todos', mocks.ops);

  await helper.deleteDocument('doc-1');
  assert.deepEqual(mocks.calls.remove[0], [db, 'todos', 'doc-1']);
});

test('updateField sanitizes payload and delegates to update', async () => {
  const mocks = createMockOperations();
  const helper = new FireworkersDataHelper(db, 'todos', mocks.ops);

  await helper.updateField('doc-1', { flag: undefined, active: true });
  assert.deepEqual(mocks.calls.update[0], [
    db,
    'todos',
    'doc-1',
    { flag: null, active: true },
  ]);
});
