import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge'
import { useStore } from '../store'
import EntityCard from './EntityCard'

/**
 * EntityGroup - Renders a stage's entities
 *
 * Solo stage (1 entity): Single EntityCard
 * Multi-entity stage (2+ entities): Vertical list inside a group container
 *
 * Drop behavior:
 * - Drop on a card in SAME stage → reorder within stage
 * - Drop on a SOLO stage from different stage → create new stage at position (reorder stages)
 * - Drop on a MULTI stage from different stage → join that stage
 *
 * staggerOffset: The number of entities that come before this group (for stagger animation)
 */
export default function EntityGroup({
  stage,
  entities,
  isFocused,
  focusedEntityId,
  onClick,
  onClose,
  onSplit,
  tabs,
  activeTabId,
  onMoveToTab,
  onMoveToNewTab,
  onReorderInStage,
  onJoinStage,
  onCreateStageAtPosition,
  staggerOffset = 0,
  stageIndex = 0,
  totalStages = 1
}) {
  const loadStage = useStore(s => s.loadStage)
  const initialLoadDone = useStore(s => s.initialLoadDone)

  // Calculate stagger delay for the group container
  const groupStaggerDelay = (!initialLoadDone || loadStage < 5) ? staggerOffset * 0.08 : 0

  const isSoloStage = entities.length === 1

  // Skip entry animation after initial load (so reorder doesn't animate)
  const skipEntryAnimation = initialLoadDone && loadStage >= 5

  // Solo stage - single EntityCard with drop target
  if (isSoloStage) {
    return (
      <motion.div
        layout
        initial={skipEntryAnimation ? false : { opacity: 0, y: -20 }}
        animate={{
          opacity: loadStage >= 4 ? 1 : 0,
          y: loadStage >= 4 ? 0 : -20
        }}
        exit={{ opacity: 0, y: 20 }}
        transition={{
          layout: { type: 'tween', duration: 0.2, ease: 'easeOut' },
          type: 'spring',
          stiffness: 400,
          damping: 25,
          delay: skipEntryAnimation ? 0 : groupStaggerDelay
        }}
      >
        <EntityCardDropTarget
          entity={entities[0]}
          entityIndex={0}
          stageId={stage.id}
          stageIndex={stageIndex}
          isSoloStage={true}
          isActive={isFocused}
          onClick={() => onClick(entities[0].id)}
          onClose={() => onClose(entities[0].id)}
          tabs={tabs}
          activeTabId={activeTabId}
          onMoveToTab={onMoveToTab}
          onMoveToNewTab={onMoveToNewTab}
          staggerIndex={staggerOffset}
          disableAnimation={true}
          onReorderInStage={onReorderInStage}
          onJoinStage={onJoinStage}
          onCreateStageAtPosition={onCreateStageAtPosition}
        />
      </motion.div>
    )
  }

  // Multi-entity stage - vertical list inside group container
  return (
    <motion.div
      layout
      initial={skipEntryAnimation ? false : { opacity: 0, y: -20 }}
      animate={{
        opacity: loadStage >= 4 ? 1 : 0,
        y: loadStage >= 4 ? 0 : -20
      }}
      exit={{ opacity: 0, y: 20 }}
      transition={{
        layout: { type: 'tween', duration: 0.2, ease: 'easeOut' },
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: skipEntryAnimation ? 0 : groupStaggerDelay
      }}
    >
      <div className="flex flex-col gap-2 p-2 rounded-2xl border border-white/20 bg-white/5">
        {entities.map((entity, idx) => (
          <EntityCardDropTarget
            key={entity.id}
            entity={entity}
            entityIndex={idx}
            stageId={stage.id}
            stageIndex={stageIndex}
            isSoloStage={false}
            isActive={isFocused && entity.id === focusedEntityId}
            onClick={() => onClick(entity.id)}
            onClose={() => onClose(entity.id)}
            onSplit={() => onSplit?.(entity.id)}
            tabs={tabs}
            activeTabId={activeTabId}
            onMoveToTab={onMoveToTab}
            onMoveToNewTab={onMoveToNewTab}
            staggerIndex={staggerOffset + idx}
            disableAnimation={true}
            onReorderInStage={onReorderInStage}
            onJoinStage={onJoinStage}
            onCreateStageAtPosition={onCreateStageAtPosition}
            totalInStage={entities.length}
          />
        ))}
      </div>
    </motion.div>
  )
}

/**
 * EntityCardDropTarget - Wraps EntityCard with drop target behavior
 */
function EntityCardDropTarget({
  entity,
  entityIndex,
  stageId,
  stageIndex,
  isSoloStage,
  isActive,
  onClick,
  onClose,
  onSplit,
  tabs,
  activeTabId,
  onMoveToTab,
  onMoveToNewTab,
  staggerIndex,
  disableAnimation,
  onReorderInStage,
  onJoinStage,
  onCreateStageAtPosition,
  totalInStage = 1
}) {
  const dropRef = useRef(null)
  const [dropState, setDropState] = useState({ isDraggedOver: false, closestEdge: null })

  useEffect(() => {
    const el = dropRef.current
    if (!el) return

    return dropTargetForElements({
      element: el,
      getData: ({ input, element }) => {
        return attachClosestEdge(
          { targetStageId: stageId, targetEntityIndex: entityIndex, targetEntityId: entity.id },
          { element, input, allowedEdges: ['top', 'bottom'] }
        )
      },
      canDrop: ({ source }) => {
        // Only accept 'move' source (entity cards)
        if (source.data.source !== 'move') return false
        // Don't drop on self
        if (source.data.entityId === entity.id) return false
        return true
      },
      onDragEnter: ({ self, source }) => {
        const edge = extractClosestEdge(self.data)
        setDropState({ isDraggedOver: true, closestEdge: edge })
      },
      onDrag: ({ self }) => {
        const edge = extractClosestEdge(self.data)
        setDropState(prev => prev.closestEdge !== edge ? { isDraggedOver: true, closestEdge: edge } : prev)
      },
      onDragLeave: () => {
        setDropState({ isDraggedOver: false, closestEdge: null })
      },
      onDrop: ({ self, source }) => {
        setDropState({ isDraggedOver: false, closestEdge: null })

        const { entityId: draggedEntityId, stageId: sourceStageId } = source.data
        const edge = extractClosestEdge(self.data)

        if (sourceStageId === stageId) {
          // Same stage: reorder within
          let targetIndex = entityIndex
          if (edge === 'bottom') {
            targetIndex = entityIndex + 1
          }
          onReorderInStage?.(stageId, draggedEntityId, targetIndex)
        } else if (isSoloStage) {
          // Different stage, target is solo: create new stage at position (reorder stages)
          // Drop above = insert at stageIndex, drop below = insert at stageIndex + 1
          const position = edge === 'top' ? stageIndex : stageIndex + 1
          onCreateStageAtPosition?.(draggedEntityId, sourceStageId, position)
        } else {
          // Different stage, target is multi-entity: join this stage
          let targetIndex = entityIndex
          if (edge === 'bottom') {
            targetIndex = entityIndex + 1
          }
          onJoinStage?.(draggedEntityId, sourceStageId, stageId, targetIndex)
        }
      }
    })
  }, [stageId, stageIndex, entityIndex, entity.id, isSoloStage, onReorderInStage, onJoinStage, onCreateStageAtPosition])

  return (
    <div ref={dropRef} className="relative">
      {/* Drop indicator - top */}
      {dropState.isDraggedOver && dropState.closestEdge === 'top' && (
        <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-teal-400 rounded-full z-10" />
      )}

      <EntityCard
        entity={entity}
        isActive={isActive}
        onClick={onClick}
        onClose={onClose}
        onSplit={onSplit}
        tabs={tabs}
        activeTabId={activeTabId}
        onMoveToTab={onMoveToTab}
        onMoveToNewTab={onMoveToNewTab}
        staggerIndex={staggerIndex}
        disableAnimation={disableAnimation}
        stageId={stageId}
        entityIndex={entityIndex}
      />

      {/* Drop indicator - bottom */}
      {dropState.isDraggedOver && dropState.closestEdge === 'bottom' && (
        <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-teal-400 rounded-full z-10" />
      )}
    </div>
  )
}
