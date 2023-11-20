/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	isNeverField,
	isNeverTree,
	allowsRepoSuperset,
	allowsTreeSchemaIdentifierSuperset,
	allowsFieldSuperset,
	allowsTreeSuperset,
} from "./comparison";
export {
	addCrossFieldQuery,
	CrossFieldManager,
	CrossFieldMap,
	CrossFieldQuerySet,
	CrossFieldTarget,
	setInCrossFieldMap,
} from "./crossFieldQueries";
export { ChangesetLocalIdSchema, EncodedChangeAtomId } from "./modularChangeFormat";
export { FieldKind, FullSchemaPolicy, Multiplicity, FieldKindWithEditor } from "./fieldKind";
export {
	FieldChangeHandler,
	FieldChangeRebaser,
	getIntention,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangePruner,
	referenceFreeFieldChangeRebaser,
	RemovedTreesFromChild,
	RevisionMetadataSource,
	RevisionIndexer,
	ToDelta,
	NodeExistenceState,
} from "./fieldChangeHandler";
export {
	FieldChange,
	FieldChangeMap,
	HasFieldChanges,
	ModularChangeset,
	NodeChangeset,
	RevisionInfo,
	NodeExistsConstraint,
} from "./modularChangeTypes";
export { GenericChangeset, genericChangeHandler, genericFieldKind } from "./genericField";
export {
	ModularChangeFamily,
	ModularEditBuilder,
	EditDescription,
	revisionMetadataSourceFromInfo,
} from "./modularChangeFamily";
export {
	SingleSlotAnchorSetTypes,
	singleSlotFieldAnchorSetOps,
} from "./singleSlotShapedFieldAnchorSet";
export { SequenceAnchorSetTypes, sequenceFieldAnchorSetOps } from "./sequenceShapedFieldAnchorSet";
