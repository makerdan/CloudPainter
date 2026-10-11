// Reprocess saved REAL Poe outputs. Does not send another paid request.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { contoursFromMask } from "../src/lib/outlineProvider";
import { validOutline } from "@workspace/outline-core";
import sharp from "sharp";
import { traceEdges } from "../../cloudpainter/src/lib/outlineEdges";
for (const fixture of [".", "dog", "cats"]) {
  const bytes = await readFile(resolve(import.meta.dirname, "../../../generated-artifacts/poe-mask-probe", fixture, "output-1.png"));
  const contours = await contoursFromMask(bytes, { png: Buffer.alloc(0), width: 512, height: 512, left: 0, top: 0 }, .5);
  assert.ok(contours.length > 0);
  assert.ok(contours.every(c => validOutline(c.points)));
  console.log(`${fixture}: ${contours.length} real-mask boundaries, ${contours.map(c => c.points.length).join(", ")} points; all finite and bounded.`);
  if (fixture !== ".") {
    const input = await readFile(resolve(import.meta.dirname, "../../../generated-artifacts/poe-mask-probe", fixture, "source.png"));
    const {data,info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const edgePaths = traceEdges({pixels:new Uint8ClampedArray(data),width:info.width,height:info.height,sensitivity:.5});
    assert.ok(edgePaths.length > 0 && edgePaths.every(c => validOutline(c.points)));
    console.log(`${fixture}: real-photo Sobel tracing returned ${edgePaths.length} bounded edge paths; no provider transport.`);
  }
}
