/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	FieldKinds,
	fieldKinds,
	fieldKindConfigurations,
	getCodecTreeForModularChangeFormat,
	type ModularChangeFormatVersion,
	defaultSchemaPolicy,
} from "./defaultFieldKinds.js";

export {
	type DefaultChangeset,
	type DetachedRootIds,
	type DetachedRootIdRange,
	DefaultChangeFamily,
	type IdBasedChangeFamilyDataEditor,
	DefaultIdBasedDataEditor,
	type DataEditor,
	type RequiredFieldEditor,
	type OptionalFieldEditor,
	type SequenceFieldEditor,
	intoDelta,
	getBuildsIds,
	relevantRemovedRoots,
} from "./defaultEditBuilder.js";

export {
	type DetachedRootLocation,
	type DetachedRootsLocation,
	type Locator,
	LocationBasedDataEditor,
	type ILocationBasedDataEditor,
} from "./locationBasedEditBuilder.js";

export { MappedEditBuilder } from "./mappedEditBuilder.js";
