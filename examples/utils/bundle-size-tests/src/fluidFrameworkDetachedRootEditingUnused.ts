/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { configuredSharedTreeAlpha, DetachedRootEditing } from "fluid-framework/alpha";

// Use the import only in a type so TypeScript accepts it without a runtime reference.
// The probe's verbatimModuleSyntax setting leaves its removal to webpack.
export type UnusedProvider = typeof DetachedRootEditing;

export const SharedTree = configuredSharedTreeAlpha({});
