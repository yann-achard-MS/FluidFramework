/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NodeIndex } from "../../../core";
import { Mutable } from "../../../util";
import { AnchorSetAspects, FieldAnchorSetEntry } from "../anchorSetOps";

/**
 * A child key for a sequence-shaped field.
 */
export type SequenceKey = NodeIndex;

/**
 * An entry in an anchor set for a sequence-shaped field.
 */
export type SequenceAnchorEntry<TData> = FieldAnchorSetEntry<TData, NodeIndex>;

/**
 * A set of anchors for a sequence-shaped field.
 */
export interface SequenceFieldAnchorSet<TData = unknown> {
	list: Mutable<SequenceAnchorEntry<TData>>[];
}

/**
 * Helper type function to describe the concrete aspect types of a {@link FieldAnchorSetOps} implementation
 * that relies on {@link sequenceFieldAnchorSetOps}.
 */
export interface SequenceAnchorSetTypes<TData, TChange>
	extends AnchorSetAspects<SequenceFieldAnchorSet<TData>, NodeIndex, TChange> {}
