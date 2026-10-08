import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetQueueCount } from "./queue-store";

afterEach(() => {
  cleanup();
  // Kho số việc là biến cấp mô-đun: không để số của ca trước lọt sang ca sau.
  resetQueueCount();
});
