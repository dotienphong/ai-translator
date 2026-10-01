import type { Command, Commands, EventName, Events, Ipc } from "./ipc";

// Bản giả của `Ipc` cho test: trả kết quả theo bảng `handlers`, ghi lại các lệnh đã gọi, và cho
// test tự phát sự kiện như phía Rust. Chỉ dùng trong file *.test.ts.
type Handlers = { [C in Command]?: (args: Commands[C]["args"]) => Commands[C]["result"] | Promise<Commands[C]["result"]> };

export function fakeIpc(handlers: Handlers) {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const calls: { cmd: Command; args: unknown }[] = [];
  const ipc: Ipc = {
    async invoke(cmd, args) {
      calls.push({ cmd, args });
      const handler = handlers[cmd] as ((a: unknown) => unknown) | undefined;
      if (!handler) throw `Command ${cmd} not allowed by ACL`;
      return (await handler(args)) as never;
    },
    async listen(event, handler) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler as (payload: unknown) => void);
      listeners.set(event, set);
      return () => set.delete(handler as (payload: unknown) => void);
    },
  };
  return {
    ipc,
    calls,
    emit<E extends EventName>(event: E, payload: Events[E]) {
      listeners.get(event)?.forEach((h) => h(payload));
    },
    listenerCount(event: EventName) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}
