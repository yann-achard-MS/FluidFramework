/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
export {
	DefaultChangeset,
	DefaultChangeFamily,
	defaultChangeFamily,
	DefaultEditBuilder,
	IDefaultEditBuilder,
	ValueFieldEditBuilder,
	OptionalFieldEditBuilder,
	SequenceFieldEditBuilder,
} from "./defaultChangeFamily";
export {
	EditableField,
	EditableTree,
	EditableTreeContext,
	EditableTreeOrPrimitive,
	getEditableTreeContext,
	typeSymbol,
	typeNameSymbol,
	indexSymbol,
	isEditableField,
	isPrimitive,
	isPrimitiveValue,
	getPrimaryField,
	isUnwrappedNode,
	PrimitiveValue,
	proxyTargetSymbol,
	UnwrappedEditableField,
	UnwrappedEditableTree,
	valueSymbol,
	getField,
	createField,
	replaceField,
	ContextuallyTypedNodeDataObject,
	ContextuallyTypedNodeData,
	MarkedArrayLike,
	isWritableArrayLike,
	isContextuallyTypedNodeDataObject,
} from "./editable-tree";
export { ForestIndex } from "./forestIndex";
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
export { buildForest } from "./object-forest";
export { SchemaIndex, SchemaEditor, getSchemaString } from "./schemaIndex";
export {
	singleStackTreeCursor,
	CursorAdapter,
	prefixPath,
	prefixFieldPath,
} from "./treeCursorUtils";
export { singleTextCursor, jsonableTreeFromCursor } from "./treeTextCursor";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as SequenceField from "./sequence-field";
export { SequenceField };

export { defaultSchemaPolicy, emptyField, neverField, neverTree } from "./defaultSchema";

export {
	ChangesetLocalId,
	isNeverField,
	ModularChangeFamily,
	ModularEditBuilder,
	FieldChangeHandler,
	FieldChangeRebaser,
	FieldChangeEncoder,
	NodeChangeset,
	ValueChange,
	FieldChangeMap,
	FieldChange,
	FieldChangeset,
	ToDelta,
	ModularChangeset,
	IdAllocator,
	FieldKind,
	Multiplicity,
	FullSchemaPolicy,
	allowsRepoSuperset,
	GenericChangeset,
	genericFieldKind,
	NodeReviver,
	baseChangeHandlerKeyFunctions,
	genericAnchorSetFactory,
	noRebaseAnchorSetFactoryFactory,
	BaseAnchorSet,
	BaseNodeKey,
	RebaseDirection,
	singleCellAnchorSetFactory,
	SingleCellAnchorSet,
	BrandedFieldAnchorSet,
	GenericAnchorSet,
	SingleCellKey,
	SingleCellChangeCodec,
	singleCellFieldEncoder,
	referenceFreeFieldChangeRebaser,
	singleCellKeyFunctions,
} from "./modular-schema";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as FieldKinds from "./defaultFieldKinds";
export { FieldKinds };

export { mapFieldMarks, mapFieldChanges, mapMark, mapMarkList } from "./deltaUtils";

export {
	EditManagerIndex,
	CommitEncoder,
	commitEncoderFromChangeEncoder,
	parseSummary as loadSummary,
	stringifySummary as encodeSummary,
} from "./editManagerIndex";

export { ForestRepairDataStore } from "./forestRepairDataStore";
export { dummyRepairDataStore } from "./fakeRepairDataStore";

export { runSynchronousTransaction } from "./defaultTransaction";
export { mapFromNamed, namedTreeSchema } from "./viewSchemaUtil";

export { TreeChunk, chunkTree, buildChunkedForest } from "./chunked-forest";
