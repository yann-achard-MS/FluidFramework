/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type Anchor,
	type AnchorLocator,
	AnchorSet,
	type AnchorSlot,
	type AnchorNode,
	anchorSlot,
	type AnchorEvents,
	type AnchorSetRootEvents,
} from "./anchorSet.js";
export {
	type ITreeCursor,
	CursorLocationType,
	castCursorToSynchronous,
	mapCursorField,
	mapCursorFields,
	forEachNode,
	forEachNodeInSubtree,
	forEachField,
	iterateCursorField,
	type ITreeCursorSynchronous,
	type PathRootPrefix,
	inCursorField,
	inCursorNode,
	CursorMarker,
	isCursor,
} from "./cursor.js";
export {
	type ProtoNodes,
	type Root as DeltaRoot,
	type Mark as DeltaMark,
	type DetachedNodeId as DeltaDetachedNodeId,
	type FieldMap as DeltaFieldMap,
	type DetachedNodeChanges as DeltaDetachedNodeChanges,
	type DetachedNodeBuild as DeltaDetachedNodeBuild,
	type DetachedNodeDestruction as DeltaDetachedNodeDestruction,
	type DetachedNodeRename as DeltaDetachedNodeRename,
	type FieldChanges as DeltaFieldChanges,
} from "./delta.js";
export { type MapTree, type ExclusiveMapTree, deepCopyMapTree } from "./mapTree.js";
export {
	clonePath,
	topDownPath,
	getDepth,
	type UpPath,
	type NormalizedUpPath,
	type INormalizedUpPath,
	type NormalizedFieldUpPath,
	type FieldUpPath,
	type Range,
	type RangeUpPath,
	type PlaceUpPath,
	type PlaceIndex,
	type NodeIndex,
	compareUpPaths,
	compareFieldUpPaths,
	isDetachedUpPathRoot,
	getDetachedFieldContainingPath,
	getDetachedFieldContainingFieldPath,
	type UpPathDefault,
} from "./pathTree.js";
export {
	type FieldMapObject,
	type GenericFieldsNode,
	genericTreeDeleteIfEmpty,
	genericTreeKeys,
	type GenericTreeNode,
	getGenericTreeField,
	type JsonableTree,
	setGenericTreeField,
} from "./treeTextFormat.js";
export { EncodedJsonableTree } from "./persistedTreeTextFormat.js";
export {
	EmptyKey,
	type TreeType,
	type ChildLocation,
	type DetachedField,
	type ChildCollection,
	type RootField,
	type Value,
	type TreeValue,
	detachedFieldAsKey,
	keyAsDetachedField,
	rootFieldKey,
	type NodeData,
	NodeSource,
	rootField,
	aboveRootPlaceholder,
} from "./types.js";
export { type DeltaVisitor, visitDelta } from "./visitDelta.js";
export {
	type AnnouncedVisitor,
	announceDelta,
	applyDelta,
	createAnnouncedVisitor,
	combineVisitors,
	makeDetachedFieldIndex,
} from "./visitorUtils.js";

export { SparseNode, getDescendant } from "./sparseTree.js";

export {
	deltaForRootInitialization,
	makeDetachedNodeId,
	offsetDetachId,
	emptyDelta,
} from "./deltaUtil.js";

export {
	type TreeChunk,
	dummyRoot,
	cursorChunk,
	tryGetChunk,
	type ChunkedCursor,
} from "./chunk.js";

export {
	DetachedFieldIndex,
	type DetachedFieldIndexCheckpoint,
	type ReadOnlyDetachedFieldIndex,
} from "./detachedFieldIndex.js";

export { detachedFieldIndexCodecBuilder } from "./detachedFieldIndexCodecs.js";
export { DetachedFieldIndexFormatVersion } from "./detachedFieldIndexFormatCommon.js";
export { type FormatV1 } from "./detachedFieldIndexFormatV1.js";

export { type ForestRootId } from "./detachedFieldIndexTypes.js";
