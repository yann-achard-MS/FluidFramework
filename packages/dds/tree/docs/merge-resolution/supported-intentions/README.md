# Supported Intentions

This document provides a list of low-level editing intentions supported by SharedTree out of the box.

## Intentions on History

### Undo


## Intentions on Nodes

### Set Value

> Status: implemented for non-concurrent edits.

Sets the value of a node, replacing the existing one if any.

## Intentions on Value Fields

A value field is a field with exactly one item.

### Set

> Status: not implemented

Replaces the existing item with another.

## Intentions on Optional Fields

An optional field is a field with zero or one item.

### Set

> Status: not implemented

Populates the field with an item, potentially replacing the existing one if any.

### Clear

> Status: not implemented

Deletes the existing item if any.

## Intentions on Sequence Fields

A sequence field is a field zero or more items.

### Insert

> Status: implemented for non-concurrent edits.

Inserts new items at a specific location in the sequence.

### Delete Set

> Status: implemented for non-concurrent edits.

Deletes a set of contiguous nodes.

Nodes that are concurrently moved are still in the set and will be deleted wherever they may be at the time the edit is applied.

Notes are that concurrently deleted are still in the set.
Deletion is idempotent.