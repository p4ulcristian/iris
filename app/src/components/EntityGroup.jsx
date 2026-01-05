import { Reorder } from 'framer-motion'
import { useStore } from '../store'
import EntityCard from './EntityCard'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGripVertical } from '@fortawesome/free-solid-svg-icons'

/**
 * EntityGroup - Renders a stage's entities as a draggable group
 *
 * Solo stage (1 entity): Renders EntityCard directly
 * Multi-entity stage (2+ entities): Vertical list inside a group container
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
  staggerOffset = 0
}) {
  const loadStage = useStore(s => s.loadStage)
  const initialLoadDone = useStore(s => s.initialLoadDone)

  // Calculate stagger delay for the group container
  const groupStaggerDelay = (!initialLoadDone || loadStage < 5) ? staggerOffset * 0.08 : 0

  // Solo stage - EntityCard wrapped in Reorder.Item
  if (entities.length === 1) {
    return (
      <Reorder.Item
        value={stage}
        id={stage.id}
        initial={{ opacity: 0, y: -20 }}
        animate={{
          opacity: loadStage >= 4 ? 1 : 0,
          y: loadStage >= 4 ? 0 : -20
        }}
        exit={{ opacity: 0, y: 20 }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 25,
          delay: groupStaggerDelay
        }}
        whileDrag={{
          scale: 1.02,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          zIndex: 50
        }}
        className="flex items-center gap-1 group/stage cursor-grab active:cursor-grabbing"
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 w-4 flex items-center justify-center opacity-30 group-hover/stage:opacity-70 transition-opacity">
          <FontAwesomeIcon icon={faGripVertical} className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <EntityCard
            entity={entities[0]}
            isActive={isFocused}
            onClick={() => onClick(entities[0].id)}
            onClose={() => onClose(entities[0].id)}
            tabs={tabs}
            activeTabId={activeTabId}
            onMoveToTab={onMoveToTab}
            onMoveToNewTab={onMoveToNewTab}
            staggerIndex={staggerOffset}
            disableAnimation={true}
          />
        </div>
      </Reorder.Item>
    )
  }

  // Multi-entity stage - vertical list inside group container, wrapped in Reorder.Item
  return (
    <Reorder.Item
      value={stage}
      id={stage.id}
      initial={{ opacity: 0, y: -20 }}
      animate={{
        opacity: loadStage >= 4 ? 1 : 0,
        y: loadStage >= 4 ? 0 : -20
      }}
      exit={{ opacity: 0, y: 20 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        delay: groupStaggerDelay
      }}
      whileDrag={{
        scale: 1.02,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        zIndex: 50
      }}
      className="flex items-start gap-1 group/stage cursor-grab active:cursor-grabbing"
    >
      {/* Drag handle */}
      <div className="flex-shrink-0 w-4 flex items-center justify-center opacity-30 group-hover/stage:opacity-70 transition-opacity pt-4">
        <FontAwesomeIcon icon={faGripVertical} className="w-3 h-3 text-white" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2 p-2 rounded-2xl border border-white/20 bg-white/5">
        {entities.map((entity, idx) => (
          <EntityCard
            key={entity.id}
            entity={entity}
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
          />
        ))}
      </div>
    </Reorder.Item>
  )
}
