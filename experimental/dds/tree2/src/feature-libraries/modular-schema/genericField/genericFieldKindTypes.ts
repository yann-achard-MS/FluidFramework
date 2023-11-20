/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EmptyChangeset } from "../emptyChange";
import type { SequenceAnchorSetTypes } from "../sequenceShapedFieldAnchorSet";

/**
 * A field-agnostic set of empty changes to the elements of a field.
 */
export type GenericChangeset = EmptyChangeset;

export type GenericAnchorSetTypes<TData> = SequenceAnchorSetTypes<TData, EmptyChangeset>;
