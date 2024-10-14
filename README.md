# solid-events

A set of primitives for declarative event composition and state derivation for solidjs. You can think of it as a much simpler version of Rxjs that integrates well with Solidjs.

[Here is an implementation of the Strello demo that uses `solid-events`](https://github.com/devagrawal09/strello/pull/1/files).

## Contents
- [solid-events](#solid-events)
  - [Contents](#contents)
  - [Installation](#installation)
  - [`createEvent`](#createevent)
    - [Tranformation](#tranformation)
    - [Disposal](#disposal)
    - [Halting](#halting)
    - [Async Events](#async-events)
  - [`createSubject`](#createsubject)
    - [`createAsyncSubject`](#createasyncsubject)
    - [`createSubjectStore`](#createsubjectstore)
  - [`createTopic`](#createtopic)
  - [`createPartition`](#createpartition)
  - [Use Cases](#use-cases)
    - [State Derived from Events](#state-derived-from-events)
    - [Event Composition](#event-composition)
    - [Optimistic UI](#optimistic-ui)
    - [Fine Grained Mutations](#fine-grained-mutations)
    - [Alternative to RxJS](#alternative-to-rxjs)
    - [Functional Reactive Programming](#functional-reactive-programming)
    - [Full-Stack Reactivity](#full-stack-reactivity)

## Installation

```bash
npm install solid-events
```
or
```bash
pnpm install solid-events
```
or
```bash
bun install solid-events
```


## `createEvent`

Returns an event handler and an event emitter. The handler can execute a callback when the event is emitted.

```ts
const [onEvent, emitEvent] = createEvent()

onEvent(payload => console.log(`Event emitted:`, payload))

...

emitEvent(`Hello World!`)
// logs "Event emitted: Hello World!"
```

### Tranformation

The handler can return a new handler with the value returned from the callback. This allows chaining transformations.

```ts
const [onIncrement, emitIncrement] = createEvent()

const onMessage = onIncrement((delta) => `Increment by ${delta}`)

onMessage(message => console.log(`Message emitted:`, message))

...

emitIncrement(2)
// logs "Message emitted: Increment by 2"
```

### Disposal
Handlers that are called inside a component are automatically cleaned up with the component, so no manual bookeeping is necesarry.

```tsx
function Counter() {
  const [onIncrement, emitIncrement] = createEvent()

  const onMessage = onIncrement((delta) => `Increment by ${delta}`)

  onMessage(message => console.log(`Message emitted:`, message))

  return <div>....</div>
}
```
Calling `onIncrement` and `onMessage` registers a stateful subscription. The lifecycle of these subscriptions are tied to their owner components. This ensures there's no memory leaks.

### Halting

Event propogation can be stopped at any point using `halt()`

```ts
const [onIncrement, emitIncrement] = createEvent()

const onValidIncrement = onIncrement(delta => delta < 1 ? halt() : delta)
const onMessage = onValidIncrement((delta) => `Increment by ${delta}`)

onMessage(message => console.log(`Message emitted:`, message))

...

emitIncrement(2)
// logs "Message emitted: Increment by 2"

...

emitIncrement(0)
// Doesn't log anything
```

`halt()` returns a `never`, so typescript correctly infers the return type of the handler.

### Async Events

If you return a promise from an event callback, the resulting event will wait to emit until the promise resolves. In other words, promises are automatically flattened by events.

```ts
async function createBoard(boardData) {
  "use server"
  const boardId = await db.boards.create(boardData)
  return boardId
}

const [onCreateBoard, emitCreateBoard] = createEvent()

const onBoardCreated = onCreateBoard(boardData => createBoard(boardData))

onBoardCreated(boardId => navigate(`/board/${boardId}`))
```

## `createSubject`

Events can be used to derive state using Subjects. A Subject is a signal that can be derived from event handlers.

```ts
const [onIncrement, emitIncrement] = createEvent()
const [onReset, emitReset] = createEvent()

const onMessage = onIncrement((delta) => `Increment by ${delta}`)
onMessage(message => console.log(`Message emitted:`, message))

const count = createSubject(
  0,
  onIncrement(delta => currentCount => currentCount + delta),
  onReset(() => 0)
)

createEffect(() => console.log(`count`, count()))

...

emitIncrement(2)
// logs "Message emitted: Increment by 2"
// logs "count 2"

emitReset()
// logs "count 0"
```

To update the value of a subject, event handlers can return a value (like `onReset`), or a function that transforms the current value (like `onIncrement`).

`createSubject` can also accept a signal as the first input instead of a static value. The subject's value resets whenever the source signal updates.

```tsx
function Counter(props) {
  const [onIncrement, emitIncrement] = createEvent()
  const [onReset, emitReset] = createEvent()

  const count = createSubject(
    () => props.count,
    onIncrement(delta => currentCount => currentCount + delta),
    onReset(() => 0)
  )

  return <div>...</div>
}
```

`createSubject` has some compound variations to complete use cases.

### `createAsyncSubject`

This subject accepts a reactive async function as the first argument similar to `createAsync`, and resets whenever the function reruns.

```ts
const getBoards = cache(async () => {
  "use server";
  // fetch from database
}, "get-boards");

export default function HomePage() {
  const [onDeleteBoard, emitDeleteBoard] = createEvent<number>();

  const boards = createAsyncSubject(
    () => getBoards(),
    onDeleteBoard(
      (boardId) => (boards) => boards.filter((board) => board.id !== boardId)
    )
  );

  ...
}
```

### `createSubjectStore`

This subject is a store instead of a regular signal. Event handlers can mutate the current state of the board directly. Uses `produce` under the hood.

```ts
const boardStore = createSubjectStore(
  () => boardData(),
  onCreateNote((createdNote) => (board) => {
    const index = board.notes.findIndex((n) => n.id === note.id);
    if (index === -1) board.notes.push(note);
  }),
  onDeleteNote(([id]) => (board) => {
    const index = board.notes.findIndex((n) => n.id === id);
    if (index !== -1) board.notes.splice(index, 1);
  })
  ...
)
```
Similar to `createSubject`, the first argument can be a signal that resets the value of the store. When this signal updates, the store is updated using `reconcile`.

## `createTopic`

A topic combines multiple events into one. This is simply a more convenient way to merge events than manually iterating through them.

```ts
const [onIncrement, emitIncrement] = createEvent()
const [onDecrement, emitDecrement] = createEvent()

const onMessage = createTopic(
  onIncrement(() => `Increment by ${delta}`),
  onDecrement(() => `Decrement by ${delta}`)
);
onMessage(message => console.log(`Message emitted:`, message))

...

emitIncrement(2)
// logs "Message emitted: Increment by 2"

emitDecrement(1)
// logs "Message emitted: Decrement by 1"
```

## `createPartition`

A partition splits an event based on a conditional. This is simply a more convenient way to conditionally split events than using `halt()`.

```ts
const [onIncrement, emitIncrement] = createEvent()

const [onValidIncrement, onInvalidIncrement] = createPartition(
  onIncrement,
  delta => delta > 0
)

onValidIncrement(delta => console.log(`Valid increment by ${delta}`))

onInvalidIncrement(delta => console.log(`Please use a number greater than 0`))

...

emitIncrement(2)
// logs "Valid increment by 2"

emitIncrement(0)
// logs "Please use a number greater than 0"

```

## Use Cases

This section describes when and how you might benefit from this set of primitives.

### State Derived from Events

React has already taught us that most state and UI should be derived from a minimal set of mutable state. This makes it easier to reason about the application, as data always flows from top to bottom, instead of being mutated from all over the place.

```tsx
function Component() {
  const [count, setCount] = createSignal(0)

  const doubleCount = () => count() * 2

  return <div>
    Count: {count()} <br />
    double Count: {doubleCount()} <br />
    <button onClick={() => setCount(c => c + 1)}>Increment</button>
  </div>
}
```

While deriving state reduces the imperative logic we have to write, `createSignal` is still an escape hatch to allow imperative updates to state. When looking for changes made to `count`, we need to look through the entire component to see what could be calling `setCount`.

Events completely eliminate state that is mutated imperatively, since all state can now be derived.

```tsx
function Component() {
  const [onIncrement, emitIncrement] = createEvent()

  const count = createSubject(
    0,
    onIncrement(() => c => c + 1)
  )

  const doubleCount = () => count() * 2

  return <div>
    Count: {count()} <br />
    double Count: {doubleCount()} <br />
    <button onClick={emitIncrement}>Increment</button>
  </div>
}
```

State changes are much easier to reason about now since every possible mutation to `count` is present at declaration time, with a descriptive name of the event that updates it.

### Event Composition

Building heavily dynamic applications often results in lots of event handlers with huge chunks of imperative logic, which might execute side effects, update state, run business logic, etc. Quite often all this state ends up being tangled together, making it difficult to reason about the system.

Here's an example from Strello's drag and drop implementation.

```ts
const [acceptDrop, setAcceptDrop] = createSignal<"top" | "bottom" | false>(
  false
);

onDragOver={(e) => {
  // check if a valid note is dragged over
  if (!e.dataTransfer?.types.includes(DragTypes.Note)) {
    // mutate state
    setAcceptDrop(false);
    return;
  }

  // calculate and mutate state based on position
  const isTop = ...calculation;

  setAcceptDrop(isTop ? "top" : "bottom");
}}

onDrop={(e) => {
  // check if the dropped element is a valid note
  if (e.dataTransfer?.types.includes(DragTypes.Note)) {
    const noteId = e.dataTransfer?.getData(DragTypes.Note)

    action: if (noteId && noteId !== props.note.id) {
      // note is valid, run side effect
      if (acceptDrop() === "top") {
        if (props.previous && props.previous?.id === noteId) {
          break action;
        }
        moveNoteAction(...);
      }

      if (acceptDrop() === "bottom") {
        if (props.previous && props.next?.id === noteId) {
          break action;
        }
        moveNoteAction(...);
      }
    }
  }

  // mutate state
  setAcceptDrop(false);
}}
```

There are several issues with this implementation.

- Complex decisions and their results are represented by imperative logic
- Side effects are called conditionally, requiring a mental walkthrough of all the conditions

Here is an alternate version that achieves the same behavior using event composition.

```ts
const onDropNote = onDrop((e) => {
  // check if the dropped element is a valid note
  if (!e.dataTransfer?.types.includes(DragTypes.Note)) halt();

  const noteId = e.dataTransfer?.getData(DragTypes.Note);

  if (!noteId || noteId === props.note.id) halt();

  return noteId;
});

onDropNote((noteId) => {
  // when a valid note is dropped, run side effect
  if (acceptDrop() === "top" && props.previous?.id !== noteId) {
    return moveNoteAction(...);
  }

  if (acceptDrop() === "bottom" && props.next?.id !== noteId) {
    return moveNoteAction(...);
  }
});

// check if a valid note is dragged over
const [onDragOverValidEl, onDragOverInvalidEl] = createPartition(
  onDragOver,
  (e) => !!e.dataTransfer?.types.includes(DragTypes.Note)
);

// derive highlight state based on element and position
const acceptDrop = createSubject<"top" | "bottom" | false>(
  false,
  onDrop(() => false),
  onDragOverInvalidEl(() => false),
  onDragOverValidEl((e) => {
    const isTop = ...calculation
    return isTop ? "top" : "bottom";
  })
);
```

This implementation might be slightly verbose, but has some nice benefits.

- Results of conditionals are represented as explicit events
- All side effects move towards the bottom of the flow
- Events are single-purpose and descriptive

### Optimistic UI

Optimistic UI implementation can be simplified by deriving state from user events.

Here is another example from Strello, this time the optimistic deletion of boards from the home screen.
```ts
const serverBoards = createAsync(() => getBoards());
const deleteBoardSubmissions = useSubmissions(deleteBoard);

const boards = () => {
  if (deleteBoardSubmissions.pending) {
    const deletedBoards: number[] = [];

    for (const sub of deleteBoardSubmissions) {
      deletedBoards.push(sub.input[0]);
    }

    return serverBoards()?.filter(
      (board) => !deletedBoards.includes(board.id)
    );
  }

  return serverBoards();
};
```

Since this version relies on the state of inflight submissions, it has to loop through all the possible deletions, and remove them from the data before returning it.

Here is an alternate version that achieves the same behavior using an async subject.

```ts
const [onDeleteBoard, emitDeleteBoard] = createEvent<number>();
onDeleteBoard(useAction(deleteBoard));

const boards = createAsyncSubject(
  () => getBoards(),
  onDeleteBoard(
    (boardId) => (boards) => boards.filter((board) => board.id !== boardId)
  )
);
```

This version uses an event handler for the deleted board and removes it from the state. Not only is it simpler to read, but also slightly more performant since it doesn't require iterating over submissions.

### Fine Grained Mutations

The Strello demo achieves fine grained optimistic mutations through a series of clever hacks around effects, submissions, and timestamps.

```ts
createEffect(() => {
  const mutations = untrack(() => getMutations());

  const { notes, columns } = props.board;
  applyMutations(mutations, notes, columns);

  batch(() => {
    setBoardStore("notes", reconcile(notes));
    setBoardStore("columns", reconcile(columns));
  });
});

createEffect(() => {
  const mutations = getMutations();
  const prevTimestamp = untrack(() => boardStore.timestamp);
  const latestMutations = mutations.filter(
    (m) => m.timestamp > prevTimestamp
  );

  setBoardStore(
    produce((b) => {
      applyMutations(latestMutations, b.notes, b.columns);
      b.timestamp = Date.now();
    })
  );
});
```

This implementation is highly performant since each optimistic update:

- is only ever applied once, and filtered out using timestamps for future runs
- mutates the store in a fine-grained way, without any reconciliation required

However, there are several issues with this, since it requires:

- effects that directly mutate state, leading to two sequential updates of the reactive graph
- two separate effects that seem to do similar things, making it difficult to reason about the mechanics
- timestamp to keep track of when the board was last updated
- multiple iterations through in-flight submissions
- the `getMutation` and `applyMutations` functions which have a lot of redundant logic

Here is an alternate version that achieves the same behavior using a subject store.

```ts
const boardStore = createSubjectStore(
  () => boardData(),
  onCreateNote(([note]) => (board) => {
    const index = board.notes.findIndex((n) => n.id === note.id);
    if (index === -1) board.notes.push(note);
  }),
  onMoveNote(([noteId, columnId, order]) => (board) => {
    const index = board.notes.findIndex((n) => n.id === noteId);
    if (index !== -1) {
      board.notes[index].column = columnId;
      board.notes[index].order = order;
    }
  }),
  onEditNote(...),
  onDeleteNote(...),
  onCreateColumn(...),
  onRenameColumn(...),
  onMoveColumn(...),
  onDeleteColumn(...)
);
```
This version achieves the same fine-grained mutation behavior as the original, except it also:

- eliminates the need for multiple effects that do similar things
- colocates all the mutations together
- doesn't iterate through submissions
- updates everything in a single run of the graph
- simplifies the logic

Overall, Events and Subjects make implementing fine grained optimistic UI much easier.

### Alternative to RxJS

NOTE: `createEvent` currently uses RxJS observables under the hood as an implementation detail. This is subject to change.

You can achieve similar benefits by using RxJS directly. Then why use `createEvent`?

My first theory is that as you attempt to use RxJS with Solidjs, you will end up building something similar to `createEvent` yourself.

RxJS observables are very simple and very powerful. They handle event composition, reactive state, stateful lifecycles, higher order streaming, and much more.

The versatility of observables is both a blessing and a curse - using them for everything requires a lot of knowledge about operators, and writing code using pipes, which is very different from typical procedural logic.

Solid's reactivity system is very different - it's designed using multiple reactive primitives that each play a very specific role, instead of a single fundamental piece that makes up everything. signals handle state, effects handle side effects, memos handle caching, and roots handle lifecycles.

The only piece that's missing from Solid's inventory of primitives is event composition. `createEvent` takes the approach of filling a void in an existing system, rather than bringing a whole new system for a small task.

This means `createEvent` by itself is a lot less powerful than RxJS observables, since it cannot do things like state management or higher order streaming. However, those tasks are already well accomplished by Solid's existing primitives, which means `createEvent` can stay lean and easy to learn. No need to learn a bunch of operators.

### Functional Reactive Programming

Speaking of RxJS, there have been multiple attempt at bringing some functional reactive goodness into javascript (RxJS being the most popular one).

Most implementations of FRP ideas in Javascript use a single reactive primitive to represent everything (including Elm's original idea of signals). This is because the conception of FRP in Haskell used continuous time and required two primitives, one to represent continuous pull-able values (behaviors), one to represent discrete push-able values (events). Subsequent implementations of FRP on the web dropped the idea of continuous time, and therefore the primitive that represented continuous values, leaving behind a single discrete reactive primitive.

Reactive systems like KnockoutJS went the other way and dropped push-able primitive, and only implemented a single pull-based reactive primitive, which we now know as signals. While signals are still technically discrete, they retain the pull-based semantics of classic FRP.

So contemporary reactive systems are built either entirely on push based values (observables/rxjs) or entire on pull based values (signals/solidjs).

`createEvent` reintroduces a push-based primitive into Solidjs to complement signals, making the end result look a lot closer to classic FRP.

### Full-Stack Reactivity

`createEvent` superpowers the full-stack reactive capabilities of `"use socket"` and server signals.

More info coming soon.