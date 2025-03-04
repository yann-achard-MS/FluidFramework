/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { DetachedNodeId } from "./delta.js";

/**
 * Represents the change made to a document.
 * Immutable, therefore safe to retain for async processing.
 */
export interface Root {
	readonly detachedFields: FieldMap;
	readonly detachedNodes: readonly DetachedNode[];
}

export type Mark = Noop | Replace | Attach | Detach;

export interface Noop {
	readonly type: "noop";
	readonly nodes: readonly Node[];
}

export interface Replace {
	readonly type: "replace";
	readonly nodes: readonly Node[];
	readonly detach: DetachedNodeIdPair;
	readonly attach: DetachedNodeIdPair;
}

export interface Attach {
	readonly type: "attach";
	readonly attach: DetachedNodeIdPair;
}

export interface Detach {
	readonly type: "detach";
	readonly nodes: readonly Node[];
	readonly detach: DetachedNodeIdPair;
}

export interface InteriorNode {
	readonly type?: string;
	readonly fields: FieldMap;
}

export interface DetachedNode {
	readonly src?: "build" | "refresh";
	readonly dst?: "attach" | "destroy";
	readonly id: DetachedNodeIdPair;
	readonly nodes: readonly Node[];
}

export type DetachedNodeIdPair = [DetachedNodeId, DetachedNodeId];

export type MarkList = readonly Mark[];
export interface FieldMap {
	readonly [key: string]: MarkList;
}

export type Node = LeafNode | InteriorNode;
// eslint-disable-next-line @rushstack/no-new-null
export type LeafNode = number | string | boolean | IFluidHandle | null;
