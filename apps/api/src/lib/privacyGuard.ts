import type { FastifyReply, FastifyRequest } from "fastify";
import { findForbiddenContentFields } from "@dictivo/shared";

export function rejectForbiddenContentFields(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  const matches = findForbiddenContentFields(request.body);
  if (matches.length > 0) {
    void reply.code(400).send({
      error: "content_fields_not_allowed",
      message: "This API accepts metadata only. Audio, transcripts, summaries, snippets, dictionaries, and credentials must stay local.",
      fields: matches
    });
    return;
  }
  done();
}
