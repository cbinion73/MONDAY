---
name: monday-forge-concept-to-print
description: Turn an approved visual concept into a verified, printable 3D model through image generation, a Meshy turnaround, Blender cleanup, and Creality Print preparation. Use when Chris wants to make a figure, prop, model, or object from a description or reference image; do not use for purely digital renders or mechanical CAD design.
---

# Monday FORGE: Concept-to-Print

Lead with the current artifact and the next approval that matters. This is a
human-approved manufacturing workflow, not a promise that an attractive image
is a printable object.

## The workflow

1. **Brief** — Collect the subject, reference image(s) if any, intended physical
   size, printer/material constraints, and the desired pose/view. State any
   assumptions that materially affect the model, especially scale, separate
   parts, fragile features, and intended display/use.
2. **Hero concept** — Generate a high-resolution image that makes the pose,
   silhouette, proportions, and major details unambiguous. Iterate only on the
   requested changes. Stop for Chris's explicit hero-image approval.
3. **Turnaround** — From the approved hero concept, generate a visually
   consistent reference set: orthographic front, left, right, and rear views;
   add a top/bottom or close-up sheet only when the geometry needs it. Keep
   pose, proportions, costume/detail placement, lighting, framing, and scale
   consistent. Label the views and preserve the approved hero image with the
   set. Stop for Chris's turnaround approval before a Meshy upload.
4. **Meshy reconstruction** — Upload the approved turnaround set to Meshy and
   create the initial mesh. This is an external account/service action: use an
   available Meshy connection or its visible UI, never claim an upload or a
   generation occurred without evidence. Download the actual Meshy model file
   and retain its source format and exact path.
5. **Blender cleanup** — Import the downloaded model into Blender. Correct
   scale and orientation; remove floating/intersecting/hidden geometry;
   repair non-manifold edges, holes, normals, and self-intersections; simplify
   or reinforce fragile details; split parts when assembly or print orientation
   warrants it. Preserve intentional visual detail where practical. Export a
   clean working model and a print-ready model, reporting exact paths and
   formats.
6. **Model review** — Show Chris the cleaned model from useful views and report
   dimensions, intended material, part count, known compromises, and remaining
   risks. Do not slice or print until he explicitly approves the cleaned model.
7. **Creality Print preparation** — After model approval, prepare the print:
   select material/profile, orientation, layer height, walls/infill where
   appropriate, supports, brim/raft if needed, and parts/plate layout. Report
   the slicer's estimated time, material, and any support or quality tradeoff.
   Require explicit approval immediately before starting, sending, or queuing a
   physical print.

## Artifact and approval contract

Keep a traceable set of artifacts, rather than overwriting the only version:

| Stage | Required artifact | Approval required |
| --- | --- | --- |
| Hero concept | high-resolution approved image | before turnaround |
| Turnaround | labeled front/left/right/rear images | before Meshy upload |
| Reconstruction | downloaded source mesh with exact path/format | before cleanup review |
| Cleanup | verified clean model and print-ready export | before slicing |
| Slice | Creality Print project/profile and estimate | immediately before physical print |

Do not equate a WebGL preview, a screenshot, a render, or a successful Meshy
job with delivery. A model is delivered only when the actual file exists at a
reported path and opens in Blender or another appropriate verifier. A model is
print-ready only when its geometry, scale, intended material, and slicer setup
have been checked.

## Tool boundaries

- Use the image-generation capability for the hero concept and turnaround set.
  Do not use a generic image variation as a turnaround if it changes anatomy,
  pose, silhouette, or details between views.
- Meshy is the reconstruction service in this workflow. It may require Chris's
  account, credits, or a browser action; obtain confirmation at the action time
  when a charge, upload, or account-bound operation is not already authorized.
- Blender is the local cleanup and validation environment. Prefer reversible
  edits, save the working file before destructive mesh operations, and preserve
  the downloaded source mesh.
- Creality Print is the slicer and physical-print handoff. Creating a slice is
  not authorization to send it to a printer; actual printer execution always
  needs a fresh explicit approval.

## Practical judgment

Flag and resolve before printing: unsupported overhangs, thin projecting parts,
sealed cavities, trapped resin/powder where relevant, tiny contact patches,
non-manifold geometry, ambiguous scale, and features below the selected
material/process resolution. When a requested pose or detail will make a poor
print, recommend the smallest design change that protects the finished object.

For a status update, state the current stage, the exact artifact(s) created,
what has been verified, what has not, and the single next approval/action.
