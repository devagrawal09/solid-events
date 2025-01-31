import { createRoot } from "solid-js";
import { describe, expect, test } from "vitest";
import {
  createEvent,
  createListener,
  createMutationListener,
  createPartition,
  createSyncListener,
  createTopic,
  halt,
} from ".";
import { setTimeout } from "timers/promises";

describe(`createEvent`, () => {
  test(`emits to callback`, () => {
    const messages = [] as string[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent();
      on((p) => messages.push(p));
      emit(`hello`);
      return d;
    });

    expect(messages).toEqual([`hello`]);
    d();
  });

  test(`emits to callback asynchronously`, async () => {
    const messages = [] as string[];

    const [d, emit] = createRoot((d) => {
      const [on, emit] = createEvent();
      on((p) => messages.push(p));
      emit(`hello`);
      return [d, emit];
    });

    expect(messages).toEqual([`hello`]);

    await setTimeout(10);
    emit(`world`);
    expect(messages).toEqual([`hello`, `world`]);
    d();
  });

  test(`cleans up with the root`, () => {
    const messages = [] as string[];

    const [d, emit] = createRoot((d) => {
      const [on, emit] = createEvent();
      on((p) => messages.push(p));
      emit(`hello`);
      return [d, emit];
    });

    expect(messages).toEqual([`hello`]);
    d();
    emit(`world`);
    expect(messages).toEqual([`hello`]);
  });

  test(`transforms into new handler`, () => {
    const messages = [] as string[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent();
      const on2 = on((p) => `Decorated: ${p}`);
      on2((p) => messages.push(p));
      emit(`hello`);
      return d;
    });

    expect(messages).toEqual([`Decorated: hello`]);
    d();
  });

  test(`halts`, () => {
    const messages = [] as string[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent<string>();
      const onValid = on((p) => (p.length < 3 ? halt(`Huh`) : p));
      onValid((p) => messages.push(p));
      emit(`hello`);
      emit(`hi`);
      return d;
    });

    expect(messages).toEqual([`hello`]);
    d();
  });

  test(`flattens a promise`, async () => {
    const messages = [] as string[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent<string>();
      const onAsync = on(async (p) => {
        await setTimeout(10);
        return p;
      });
      onAsync((p) => messages.push(p));
      emit(`hello`);
      return d;
    });

    await setTimeout(10);

    expect(messages).toEqual([`hello`]);
    d();
  });
});

describe(`createPartition`, () => {
  test(`partitions an event`, () => {
    const messages = [] as string[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent<string>();
      const [onValid, onInvalid] = createPartition(on, (p) => p.length >= 3);
      onValid((p) => messages.push(`valid: ${p}`));
      onInvalid((p) => messages.push(`invalid: ${p}`));

      emit(`hello`);
      emit(`hi`);

      return d;
    });

    expect(messages).toEqual([`valid: hello`, `invalid: hi`]);
    d();
  });
});

describe(`createSubject`, () => {
  test.todo(`need effects to run on server to test signals`);
});

describe(`createListener`, () => {
  test(`is deferred`, () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent();
      createListener(on, () => messages.push(2));
      on(() => messages.push(1));
      emit(`hello`);
      return d;
    });

    expect(messages).toEqual([1, 2]);
    d();
  });

  test(`runs in event order`, () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent<number>();

      createListener(on, (num) => messages.push(num));

      const onDouble = on((num) => num * 2);
      const onDoubleDouble = onDouble((num) => num * 2);

      createListener(onDoubleDouble, (num) => messages.push(num));
      createListener(onDouble, (num) => messages.push(num));
      createListener(on, (num) => messages.push(num));

      emit(1);
      return d;
    });

    expect(messages).toEqual([1, 1, 2, 4]);
    d();
  });

  test(`runs in event order with async`, async () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent<number>();

      createListener(on, (num) => messages.push(num));

      const onDouble = on(async (num) => {
        await setTimeout(10);
        return num * 2;
      });
      const onDoubleDouble = onDouble(async (num) => {
        await setTimeout(10);
        return num * 2;
      });

      createListener(onDoubleDouble, (num) => messages.push(num));
      createListener(onDouble, (num) => messages.push(num));
      createListener(on, (num) => messages.push(num));

      emit(1);
      return d;
    });

    await setTimeout(30);
    expect(messages).toEqual([1, 1, 2, 4]);
    d();
  });
});

describe(`createMutationListener`, () => {
  test(`is deferred`, () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent();
      createMutationListener(on, () => messages.push(2));
      on(() => messages.push(1));
      emit(`hello`);
      return d;
    });

    expect(messages).toEqual([1, 2]);
    d();
  });

  test(`is deferred before listener`, () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent();
      createListener(on, () => messages.push(3));
      createMutationListener(on, () => messages.push(2));
      on(() => messages.push(1));
      emit(`hello`);
      return d;
    });

    expect(messages).toEqual([1, 2, 3]);
    d();
  });
});

describe(`createSyncListener`, () => {
  test(`runs synchronously`, async () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [on, emit] = createEvent<number>();
      const onAsync = on(async (p) => {
        await setTimeout(10);
        return p + 1;
      });
      onAsync((p) => messages.push(p));
      createSyncListener(onAsync, (p) => {
        messages.push(0);
        p.then((p) => p && messages.push(p + 1));
      });
      emit(0);
      return d;
    });

    await setTimeout(10);
    expect(messages).toEqual([0, 1, 2]);
    d();
  });
});

describe(`createTopic`, () => {
  test(`emits to multiple listeners`, () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [onTopic, emitTopic] = createTopic<{ a: number; b: number }>();

      onTopic(`a`, (p) => messages.push(p));
      onTopic(`b`, (p) => messages.push(p + 1));

      emitTopic(`a`, 1);
      emitTopic(`b`, 2);
      return d;
    });

    expect(messages).toEqual([1, 3]);
    d();
  });

  test(`emits to nested listeners`, () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [onTopic, emitTopic] = createTopic<{
        a: number;
        b: { c: number };
      }>();

      onTopic(`a`, (p) => messages.push(p));
      onTopic(`b`, (p) => messages.push(p.c));
      onTopic(`b`, `c`, (p) => messages.push(p));

      emitTopic(`a`, 1);
      emitTopic(`b`, { c: 2 });
      emitTopic(`b`, `c`, 3);
      emitTopic({ a: 4, b: { c: 5 } });

      return d;
    });

    expect(messages).toEqual([1, 2, 2, 3, 3, 4, 5, 5]);
    d();
  });

  test(`transforms into new topic handlers`, () => {
    const messages = [] as number[];

    const d = createRoot((d) => {
      const [onTopic, emitTopic] = createTopic<{ a: { b: number } }>();

      const onB = onTopic(`a`, (p) => p.b);
      const onTopicA = onTopic(`a`);

      onB((p) => messages.push(p));
      onTopicA(`b`, (p) => messages.push(p));

      emitTopic(`a`, { b: 1 });
      emitTopic(`a`, `b`, 2);
      return d;
    });

    expect(messages).toEqual([1, 1, 2, 2]);
    d();
  });
});
