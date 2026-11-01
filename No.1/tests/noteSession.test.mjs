import test from "node:test";
import assert from "node:assert/strict";
import { NoteSession, NoteOperationQueue } from "../src/utils/noteSession.ts";

test("clean Markdown is never converted or rewritten", async () => {
  const session = new NoteSession();
  session.open("中文/笔记", "| a | b |\r\n", ["original"]);
  const saved = await session.save(["original"], () => assert.fail("serialized"), () => assert.fail("written"));
  assert.equal(saved, false);
  assert.equal(session.source, "| a | b |\r\n");
});

test("save failure leaves the session dirty and prevents navigation", async () => {
  const session = new NoteSession();
  session.open("first", "source", ["old"]);
  const queue = new NoteOperationQueue();
  let switched = false;
  await assert.rejects(queue.run(async () => {
    await session.save(["edit"], async () => "edited", async () => { throw new Error("disk full"); });
    switched = true;
  }), /disk full/);
  assert.equal(switched, false);
  assert.equal(session.path, "first");
  assert.equal(session.source, "source");
  assert.equal(session.isDirty(["edit"]), true);
  await queue.run(() => session.save(["edit"], async () => "edited", async (path, content, expected) => {
    assert.deepEqual([path, content, expected], ["first", "edited", "source"]);
  }));
  assert.equal(session.isDirty(["edit"]), false);
});

test("edits made during a save remain dirty", async () => {
  const session = new NoteSession();
  session.open("note", "old", ["old"]);
  let release;
  const writePending = new Promise(resolve => { release = resolve; });
  const saving = session.save(["snapshot"], async () => "snapshot", () => writePending);
  release();
  await saving;
  assert.equal(session.isDirty(["snapshot"]), false);
  assert.equal(session.isDirty(["newer edit"]), true);
});

test("serialization cannot mutate the editor's live document", async () => {
  const session = new NoteSession();
  session.open("note", "old", [{ text: "old" }]);
  const document = [{ text: "edited" }];
  await session.save(document, async blocks => {
    blocks[0].text = "normalized output";
    return blocks[0].text;
  }, async () => {});
  assert.deepEqual(document, [{ text: "edited" }]);
  assert.equal(session.isDirty(document), false);
});

test("operations are serialized even after a rejection", async () => {
  const queue = new NoteOperationQueue();
  const events = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = queue.run(async () => { events.push("save"); await pending; events.push("saved"); });
  const second = queue.run(async () => { events.push("delete"); throw new Error("failure"); });
  const rejected = assert.rejects(second, /failure/);
  const third = queue.run(async () => { events.push("next"); });
  await Promise.resolve();
  assert.deepEqual(events, ["save"]);
  release();
  await Promise.all([first, rejected, third]);
  assert.deepEqual(events, ["save", "saved", "delete", "next"]);
});
