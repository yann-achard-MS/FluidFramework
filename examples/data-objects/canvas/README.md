# @fluid-example/canvas

**Canvas** is a Fluid Component that displays a collaborative canvas you can draw on.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/canvas`
1. Run `npm run start` from this directory (examples/data-objects/canvas) and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Data model

Canvas uses the following distributed data structures:

- SharedDirectory - root
- Ink - Append only stream designed for ink scenarios
