/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	EmptyKey,
	type TreeType,
	type Value,
	type TreeValue,
	AnchorSet,
	type DetachedField,
	type UpPath,
	type Range,
	type RangeUpPath,
	type PlaceUpPath,
	type PlaceIndex,
	type NodeIndex,
	type DetachedPlaceUpPath,
	type DetachedRangeUpPath,
	type FieldUpPath,
	type Anchor,
	type RootField,
	type ChildCollection,
	type ChildLocation,
	type FieldMapObject,
	type NodeData,
	type GenericTreeNode,
	type JsonableTree,
	EncodedJsonableTree,
	rootFieldKey,
	rootField,
	type ITreeCursor,
	CursorLocationType,
	type ITreeCursorSynchronous,
	castCursorToSynchronous,
	type GenericFieldsNode,
	type AnchorLocator,
	genericTreeKeys,
	getGenericTreeField,
	genericTreeDeleteIfEmpty,
	getDepth,
	mapCursorField,
	mapCursorFields,
	iterateCursorField,
	type MapTree,
	detachedFieldAsKey,
	keyAsDetachedField,
	visitDelta,
	combineVisitors,
	announceDelta,
	applyDelta,
	makeDetachedFieldIndex,
	setGenericTreeField,
	type DeltaVisitor,
	type AnnouncedVisitor,
	type PathVisitor,
	SparseNode,
	getDescendant,
	compareUpPaths,
	clonePath,
	topDownPath,
	compareFieldUpPaths,
	forEachNode,
	forEachNodeInSubtree,
	forEachField,
	type PathRootPrefix,
	deltaForRootInitialization,
	emptyFieldChanges,
	isEmptyFieldChanges,
	makeDetachedNodeId,
	offsetDetachId,
	emptyDelta,
	type AnchorSlot,
	type AnchorNode,
	anchorSlot,
	type UpPathDefault,
	inCursorField,
	inCursorNode,
	type AnchorEvents,
	type AnchorSetRootEvents,
	type ProtoNodes,
	CursorMarker,
	isCursor,
	DetachedFieldIndex,
	type ForestRootId,
	getDetachedFieldContainingPath,
	aboveRootPlaceholder,
	type DeltaRoot,
	type DeltaProtoNode,
	type DeltaMark,
	type DeltaDetachedNodeId,
	type DeltaFieldMap,
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeBuild,
	type DeltaDetachedNodeDestruction,
	type DeltaDetachedNodeRename,
	type DeltaFieldChanges,
	type ExclusiveMapTree,
} from "./tree/index.js";

export {
	TreeNavigationResult,
	type IEditableForest,
	type IForestSubscription,
	type TreeLocation,
	type FieldLocation,
	type ForestLocation,
	type ITreeSubscriptionCursor,
	ITreeSubscriptionCursorState,
	initializeForest,
	type FieldAnchor,
	moveToDetachedField,
	type ForestEvents,
} from "./forest/index.js";

export {
	type FieldKey,
	type TreeNodeSchemaIdentifier,
	type TreeFieldStoredSchema,
	ValueSchema,
	TreeNodeStoredSchema,
	type TreeStoredSchemaSubscription as TreeStoredSchemaSubscription,
	type MutableTreeStoredSchema,
	type FieldKindIdentifier,
	type FieldKindData,
	type TreeTypeSet,
	type TreeStoredSchema,
	TreeStoredSchemaRepository,
	schemaDataIsEmpty,
	type SchemaEvents,
	forbiddenFieldKindIdentifier,
	identifierFieldKindIdentifier,
	storedEmptyFieldSchema,
	type StoredSchemaCollection,
	schemaFormat,
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	MapNodeStoredSchema,
	toTreeNodeSchemaDataFormat,
	decodeFieldSchema,
	encodeFieldSchema,
	storedSchemaDecodeDispatcher,
	type ErasedTreeNodeSchemaDataFormat,
	type SchemaAndPolicy,
	Multiplicity,
	type SchemaPolicy,
} from "./schema-stored/index.js";

export {
	type ChangeFamily,
	type ChangeFamilyCodec,
	type ChangeEncodingContext,
	type ChangeFamilyEditor,
	EditBuilder,
} from "./change-family/index.js";

export {
	areEqualChangeAtomIds,
	makeChangeAtomId,
	asChangeAtomId,
	type ChangeRebaser,
	findAncestor,
	findCommonAncestor,
	type GraphCommit,
	CommitKind,
	type CommitMetadata,
	type RevisionTag,
	RevisionTagSchema,
	RevisionTagCodec,
	type ChangesetLocalId,
	type ChangeAtomId,
	type ChangeAtomIdMap,
	type TaggedChange,
	makeAnonChange,
	tagChange,
	mapTaggedChange,
	tagRollbackInverse,
	SessionIdSchema,
	mintCommit,
	rebaseBranch,
	type BranchRebaseResult,
	rebaseChange,
	rebaseChangeOverChanges,
	type RevisionMetadataSource,
	revisionMetadataSourceFromInfo,
	type RevisionInfo,
	type EncodedRevisionTag,
	type EncodedChangeAtomId,
	taggedAtomId,
	taggedOptAtomId,
	offsetChangeAtomId,
	replaceAtomRevisions,
	getFromChangeAtomIdMap,
	setInChangeAtomIdMap,
	replaceChange,
	type RebaseStats,
	type RebaseStatsWithDuration,
} from "./rebase/index.js";

export {
	type Adapters,
	AdaptedViewSchema,
	Compatibility,
	type TreeAdapter,
	AllowedUpdateType,
} from "./schema-view/index.js";

export { type Revertible, RevertibleStatus } from "./revertible/index.js";
