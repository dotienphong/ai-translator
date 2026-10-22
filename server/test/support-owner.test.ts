import { describe, expect, it } from "vitest";
import { parseOwnerText } from "../src/support/owner";

describe("đọc tin chủ dự án gõ cho bot (spec 2026-10-22 §2.4, §2.5)", () => {
  it("câu trả lời: có mã ở đầu (không phân biệt hoa thường, nội dung có thể xuống dòng) hay không có mã", () => {
    expect(parseOwnerText("#K7Q Chào bạn")).toEqual({ kind: "reply", code: "K7Q", text: "Chào bạn" });
    expect(parseOwnerText("  #k7q\nDòng 1\nDòng 2 ")).toEqual({ kind: "reply", code: "K7Q", text: "Dòng 1\nDòng 2" });
    expect(parseOwnerText("#K7Q")).toEqual({ kind: "reply", code: "K7Q", text: "" });
    expect(parseOwnerText("Bạn thử lại nhé")).toEqual({ kind: "reply", code: null, text: "Bạn thử lại nhé" });
  });

  it("mã đúng 3 ký tự chữ hay số, không dính ký tự khác: cho phép dấu : , . - – — và khoảng trắng ngay sau mã", () => {
    expect(parseOwnerText("#K7Q, nội dung")).toEqual({ kind: "reply", code: "K7Q", text: "nội dung" });
    expect(parseOwnerText("#K7Q: ok")).toEqual({ kind: "reply", code: "K7Q", text: "ok" });
    expect(parseOwnerText("#k7q - ok")).toEqual({ kind: "reply", code: "K7Q", text: "ok" });
    expect(parseOwnerText("#K7Q — ok")).toEqual({ kind: "reply", code: "K7Q", text: "ok" });
    expect(parseOwnerText("#K7Q.")).toEqual({ kind: "reply", code: "K7Q", text: "" });
  });

  it("tin bắt đầu bằng # mà mã sai dạng thì badCode, không bao giờ tự định tuyến", () => {
    expect(parseOwnerText("#K7QX nội dung")).toEqual({ kind: "badCode" });
    expect(parseOwnerText("# K7Q nội dung")).toEqual({ kind: "badCode" });
    expect(parseOwnerText("#1 ưu tiên")).toEqual({ kind: "badCode" });
    expect(parseOwnerText("#")).toEqual({ kind: "badCode" });
    expect(parseOwnerText("#Z0Z chào")).toEqual({ kind: "reply", code: "Z0Z", text: "chào" });
    expect(parseOwnerText("Mình thấy #K7Q là spam")).toEqual({ kind: "reply", code: null, text: "Mình thấy #K7Q là spam" });
  });

  it("lệnh /ds, /chan, /mo (có hay không dấu #, gõ có dấu tiếng Việt cũng được), /tat, /bat; thiếu mã thì code null; lệnh lạ là trợ giúp", () => {
    expect(parseOwnerText("/ds")).toEqual({ kind: "list" });
    expect(parseOwnerText("/chan #k7q")).toEqual({ kind: "block", code: "K7Q" });
    expect(parseOwnerText("/chặn K7Q")).toEqual({ kind: "block", code: "K7Q" });
    expect(parseOwnerText("/mo #K7Q")).toEqual({ kind: "unblock", code: "K7Q" });
    expect(parseOwnerText("/mở #K7Q")).toEqual({ kind: "unblock", code: "K7Q" });
    expect(parseOwnerText("/chan")).toEqual({ kind: "block", code: null });
    expect(parseOwnerText("/TAT")).toEqual({ kind: "off" });
    expect(parseOwnerText("/tắt")).toEqual({ kind: "off" });
    expect(parseOwnerText("/tắt".normalize("NFD"))).toEqual({ kind: "off" });
    expect(parseOwnerText("/bat")).toEqual({ kind: "on" });
    expect(parseOwnerText("/bật")).toEqual({ kind: "on" });
    expect(parseOwnerText("/help")).toEqual({ kind: "help" });
    expect(parseOwnerText("/")).toEqual({ kind: "help" });
  });
});
