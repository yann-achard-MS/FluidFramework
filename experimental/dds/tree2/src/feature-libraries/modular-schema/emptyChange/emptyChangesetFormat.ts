/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";

export const EncodedEmptyChangeset = Type.Literal(0);

export type EncodedEmptyChangeset = Static<typeof EncodedEmptyChangeset>;
