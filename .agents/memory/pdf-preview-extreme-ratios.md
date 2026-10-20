---
name: Extreme-ratio print previews
description: Keep narrow or short artwork from becoming visibly distorted when creating a small raster preview.
---

When downsampling artwork with a very short side, do not round that side up to one pixel after shrinking the long side to a fixed thumbnail cap. If the short side would fall below one pixel, scale it to one pixel and allow the long side to exceed the usual cap.

**Why:** Integer raster dimensions make a subpixel short side quantize to one pixel, which can change the preview aspect ratio dramatically even though the source and print placement are correct.

**How to apply:** Use this when previews must preserve an image's aspect ratio for both very wide and very tall inputs. Keep the extra thumbnail size bounded by the supported source dimensions.
