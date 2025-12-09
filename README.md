# Fireworkers [![npm](https://img.shields.io/npm/v/fireworkers)](https://www.npmjs.com/package/fireworkers)

Work in progress, expect bugs and missing features.

A library to use [Cloud Firestore](https://firebase.google.com/docs/firestore) inside [Cloudflare Workers](https://workers.cloudflare.com/).

## Install

```bash
npm install fireworkers
# OR
yarn add fireworkers
# OR
pnpm add fireworkers
```

## Usage

```typescript
import * as Firestore from 'fireworkers';

const db = await Firestore.init({
  uid: 'user1234',
  project_id: 'my-project',
  client_email: 'abc-123@a-b-c-123.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----...',
  private_key_id: 'OdxPtETQKf1o2YvMTTLBzsJ3OYdiPcx7NlFE2ZAk',
  claims: {
    premium_account: true,
  },
});

const todo = await Firestore.get(db, 'todos', 'aDyjLiTViX1G7HyF74Ax');
```


## API

### init(options)

Returns a DB instance. Requires a [service account](https://firebase.google.com/docs/auth/admin/create-custom-tokens#using_a_service_account_json_file).

#### options.uid

Type: `string`

The unique identifier of the signed-in user, between 1-36 characters long.

#### options.project_id

Type: `string`

The `project_id` defined in the `serviceAccountKey.json`.

#### options.client_email

Type: `string`

The `client_email` defined in the `serviceAccountKey.json`.

#### options.private_key

Type: `string`

The `private_key` defined in the `serviceAccountKey.json`.

#### options.private_key_id

Type: `string`

The `private_key_id` defined in the `serviceAccountKey.json`.

#### (Optional) options.claims

Type: `Record<string, string | number | boolean>` | `undefined`

Optional custom claims to include in the [Security Rules](https://firebase.google.com/docs/firestore/security/get-started) `auth / request.auth` variables.

```typescript
const db = await Firestore.init({
  uid: 'user1234',
  project_id: 'my-project',
  client_email: 'abc-123@a-b-c-123.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----...',
  private_key_id: 'OdxPtETQKf1o2YvMTTLBzsJ3OYdiPcx7NlFE2ZAk',
  claims: {
    premium_account: true,
  },
});
```
**Returns**: a `DB` object containing the `project_id` and a short-lived JWT used by every other helper.

**Notes**:

- `private_key` strings copied from JSON credentials include literal `\n`; leave them intact and Fireworkers will convert them automatically.
- Call `init` again before the one-hour expiry if your Worker stays hot longer.
- Only the optional `claims` map is forwarded to Firestore security rules.


---

### get(db, ...document_path)

Gets a single document.

#### db

Type: `DB`

The DB instance.

#### document_path

Type: `string`

The document path, usually defined as `{collection_id}/{document_id}`.

Allows nested documents like `{collection_id}/{document_id}/{nested_collection_id}/{nested_document_id}`.

It can either be defined using a single string like:

```typescript
const todo = await Firestore.get(db, 'todos/aDyjLiTViX1G7HyF74Ax');
```

Or multiple params like:

```typescript
const todo = await Firestore.get(db, 'todos', 'aDyjLiTViX1G7HyF74Ax');
```
**Returns**: a document object shaped as `{ id, fields, createTime?, updateTime? }`. The `fields` map contains your original data, already converted back to native JS types.

**Errors**: If Firestore responds with an error (missing document, permission issues, malformed path), the helper throws with the REST error message.


---

### create(db, ...collection_path, fields)

Creates a new document.

#### db

Type: `DB`

The DB instance.

#### collection_path

Type: `string`

The collection path, usually defined as `{collection_id}`.

Allows nested collections like `{collection_id}/{document_id}/{nested_collection_id}`.

Nested collections can either be defined using a single string like `todo/aDyjLiTViX1G7HyF74Ax/tasks` or by passing multiple params like `'todo', 'aDyjLiTViX1G7HyF74Ax', 'tasks'`.

#### fields

Type: `Record<string, any>`

The document fields.

```typescript
const newTodo = await Firestore.create(db, 'todos', {
  title: 'Win the lottery',
  completed: false,
});
```
**Returns**: the freshly created document, including the generated ID (when not supplied) and timestamps.

**Tips**:

- To target a nested collection, pass each path segment separately: `Firestore.create(db, 'users', userId, 'todos', {...})`.
- `create` mirrors Firestore's REST `createDocument` and will fail if you provide an explicit document ID that already exists.


---

### update(db, ...document_path, fields)

Updates fields in a document. The update will fail if applied to a document that does not exist.

Implements the same functionality as Firestore's [updateDoc](https://firebase.google.com/docs/reference/js/firestore_.md#updatedoc).

#### db

Type: `DB`

The DB instance.

#### document_path

Type: `string`

The document path, defined like in [get](#document_path).

#### fields

Type: `Record<string, any>`

The fields to update.

```typescript
const updatedTodo = await Firestore.update(db, 'todos', 'aDyjLiTViX1G7HyF74Ax', {
  completed: false,
});
```
**Behavior**: REST `patch` call with `currentDocument.exists=true` so the update fails if the document is missing. Only the provided field paths are touched.

**Note**: For nested fields use dot notation in your payload: `{ 'stats.score': 12 }`.


---

### set(db, ...document_path, fields, options?)

Writes to a document. If the document does not yet exist, it will be created. If you provide `merge`, the provided data can be merged into an existing document.

Implements the same functionality as Firestore's [setDoc](https://firebase.google.com/docs/reference/js/firestore_.md#setdoc_2).

#### db

Type: `DB`

The DB instance.

#### document_path

Type: `string`

The document path, defined like in [get](#document_path).

#### fields

Type: `Record<string, any>`

The fields to update.

#### (Optional) options.merge

Type: `boolean`

If set to `true`, the provided data will be merged into an existing document instead of overwriting.

```typescript
const updatedTodo = await Firestore.set(
  db,
  'todos',
  'aDyjLiTViX1G7HyF74Ax',
  { completed: false },
  { merge: true }
);
```
**Behavior**: Sends a REST `patch` call. Without `merge`, the document is overwritten; with `merge`, Firestore applies an update mask matching the provided keys.

**Tip**: Combine `merge: true` with nested field paths to partially update deep objects, e.g. `{ 'profile.address.city': 'NYC' }`.


---

### remove(db, ...document_path)

Removes a document.

#### db

Type: `DB`

The DB instance.

#### document_path

Type: `string`

The document path, defined like in [get](#document_path).

```typescript
const todo = await Firestore.remove(db, 'todos', 'aDyjLiTViX1G7HyF74Ax');
```
**Returns**: `true` when Firestore returns a 200-level status, otherwise `false`.

**Note**: The helper currently surfaces only the ok-flag. Wrap it in your own error handling if you need detailed failure reasons.


---

### query(db, query)

Runs a query.

#### db

Type: `DB`

The DB instance.

#### query

Type: `StructuredQuery`

A [StructuredQuery](https://firebase.google.com/docs/firestore/reference/rest/v1/StructuredQuery) object.

```typescript
const todos = await Firestore.query(db, {
  from: [{ collectionId: 'todos' }],

  where: {
    fieldFilter: {
      field: {
        fieldPath: 'owner',
      },
      op: 'EQUAL',
      value: {
        stringValue: 'user1234',
      },
    },
  },
});
```
**Returns**: an array of documents identical to the output of `get`, each with `id`, `fields`, and timestamps. Empty arrays mean the query matched nothing.

**Tips**:

- Combine `from`, `where`, `orderBy`, and `limit` keys to mirror any StructuredQuery supported by Firestore's REST API.
- When you need logical OR conditions or array filters, build the `StructuredQuery` object manually or leverage the `FireworkersDataHelper` wrapper.


## TypeScript

This library has first-class TypeScript support.

To define a document interface, you can pass a generic like so:

```typescript
type Todo = {
  title: string;
  completed: boolean;
};

const todo = await Firestore.get<Todo>(db, 'todos', 'aDyjLiTViX1G7HyF74Ax');
```

## FireworkersDataHelper Wrapper

For projects migrating from server-side Firebase Admin helpers, the `FireworkersDataHelper` class provides a familiar API built on top of Fireworkers' REST primitives. It lives in `src/data-helper.ts` and is re-exported from the package entry point.

### When to use it

- You prefer describing queries with `DataFilter` / `DataFilterWrapper` trees instead of crafting StructuredQuery objects manually.
- You want convenience methods such as `addData`, `getData`, `getSingleDocument`, `updateField`, `deleteDocument`, and `getDocsByIds` while staying inside the Workers-compatible runtime.
- You do **not** need Firestore features that the REST API does not expose (real-time listeners, transactions, batched writes, server timestamps, or aggregation queries). These are intentionally omitted so the wrapper aligns with Fireworkers' capabilities.

### Quick start

```typescript
import * as Fireworkers from 'fireworkers';
import {
  FireworkersDataHelper,
  DataFilter,
  DataFilterType,
  DataFilterWrapper,
  DataFilterWrapperType,
} from 'fireworkers';

const db = await Fireworkers.init({
  uid: 'user1234',
  project_id: 'my-project',
  client_email: 'abc-123@a-b-c-123.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----...',
  private_key_id: 'OdxPtETQKf1o2YvMTTLBzsJ3OYdiPcx7NlFE2ZAk',
});

const todosHelper = new FireworkersDataHelper<{ title: string; completed: boolean }>(db, 'todos');

// Create or merge a document
await todosHelper.addData({ title: 'Ship docs', completed: false }, 'todo-1', true);

// Query with nested filters and sorting
const filters = [
  new DataFilterWrapper(DataFilterWrapperType.and, [
    new DataFilter('completed', false, DataFilterType.isEqualTo),
    new DataFilter('owner', 'user1234', DataFilterType.isEqualTo),
  ]),
];

const todos = await todosHelper.getData({
  filters,
  sortBy: { field: 'title', ascending: true },
  limit: 20,
});
```

### Supported methods

| Method | Description |
| --- | --- |
| `addData(data, docId, merge?)` | Calls `set` under the hood. Sanitises `undefined` values to `null` so payloads remain valid JSON. |
| `getData({ filters, limit, sortBy })` | Builds a `StructuredQuery` from `DataFilter` / `DataFilterWrapper` trees and returns plain document field objects. |
| `getSingleDocument(docId)` | Fetches a document by ID using a reference filter and returns `undefined` when missing. |
| `updateField(docId, partial)` | Maps to Fireworkers `update` to patch only the provided fields. |
| `deleteDocument(docId)` | Wraps `remove` to delete the document. |
| `getDocsByIds(ids)` | Applies an `IN` filter on `__name__`. Limited to 10 IDs per Firestore REST constraints. |

### Filter helpers

- `DataFilter` encapsulates a single field comparison. Supported operators mirror Firestore REST: equality/inequality, comparison, `array-contains`, `array-contains-any`, `in`, and `not-in`.
- `DataFilterWrapper` composes multiple filters with `and` or `or`, allowing arbitrarily deep trees.
- To target document IDs use the pseudo field `__name__`; the helper converts it to a document reference internally.

### Limitations vs Firebase Admin

- No support for `onSnapshot`, transactions, batched writes, server timestamps, or aggregation queries—the Cloudflare Workers environment only exposes what the REST API offers.
- Field deletion sentinels are not available; set fields to `null` or rewrite documents if you must remove data.
- `getDocsByIds` is restricted to ≤ 10 IDs per call. Batch client-side if you need more.

**Testing tip:** the constructor accepts an optional third argument where you can pass custom implementations of `set`, `update`, `remove`, and `query`. This allows you to inject stubs/spies when unit testing without hitting Firestore.

Refer to `src/data-helper.ts` for the full implementation and feel free to adapt it to your project's needs.
