import { motion } from 'framer-motion'
import { useStore } from '../store'
import GodTaskCard from './GodTaskCard'

/**
 * PaneGroup - Renders a pane's entities as stacked cards
 *
 * Solo pane (1 entity): Renders like a regular GodTaskCard
 * Group pane (2+ entities): Cards stacked with slight Y offset, focused on top
 */
export default function PaneGroup({
  pane,
  entities,  // Array of entity objects for this pane
  isFocused,
  focusedEntityId,
  onClick,
  onClose,
  tabs,
  activeTabId,
  onMoveToTab,
  onMoveToNewTab
}) {
  // Get the focused entity (or first entity if none focused)
  const effectiveFocusedId = focusedEntityId || entities[0]?.id
  const focusedEntity = entities.find(e => e.id === effectiveFocusedId) || entities[0]
  const otherEntities = entities.filter(e => e.id !== effectiveFocusedId)

  // Stack styling constants
  const STACK_OFFSET = 8  // Pixels of visible "peek" for stacked cards
  const MAX_VISIBLE_STACK = 3  // Max number of peeking cards to show

  // Solo pane - just render a regular GodTaskCard
  if (entities.length === 1) {
    return (
      <GodTaskCard
        entity={entities[0]}
        isActive={isFocused}
        onClick={onClick}
        onClose={() => onClose(entities[0].id)}
        tabs={tabs}
        activeTabId={activeTabId}
        onMoveToTab={onMoveToTab}
        onMoveToNewTab={onMoveToNewTab}
        disableReorder
      />
    )
  }

  // Group pane - render stacked cards
  return (
    <motion.div
      className="relative group"
      style={{
        // Reserve space for the stack
        paddingTop: Math.min(otherEntities.length, MAX_VISIBLE_STACK) * STACK_OFFSET
      }}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Peeking cards behind (non-interactive visual only) */}
      {otherEntities.slice(0, MAX_VISIBLE_STACK).map((entity, idx) => {
        const depth = idx + 1  // 1-indexed depth from top
        return (
          <div
            key={entity.id}
            className="absolute left-0 right-0 pointer-events-none"
            style={{
              top: (MAX_VISIBLE_STACK - depth) * STACK_OFFSET,
              opacity: 0.6 - depth * 0.15,
              transform: `scale(${1 - depth * 0.03})`,
              transformOrigin: 'top center',
              zIndex: MAX_VISIBLE_STACK - depth
            }}
          >
            <PeekingCard entity={entity} />
          </div>
        )
      })}

      {/* Focused entity card on top (fully interactive) */}
      <div className="relative" style={{ zIndex: MAX_VISIBLE_STACK + 1 }}>
        <GodTaskCard
          entity={focusedEntity}
          isActive={isFocused}
          onClick={onClick}
          onClose={() => onClose(focusedEntity.id)}
          tabs={tabs}
          activeTabId={activeTabId}
          onMoveToTab={onMoveToTab}
          onMoveToNewTab={onMoveToNewTab}
          disableReorder
        />

        {/* Stack indicator badge */}
        <div
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center text-[10px] text-white font-medium"
          title={`${entities.length} entities in this pane - Ctrl+Up/Down to cycle`}
        >
          {entities.length}
        </div>
      </div>
    </motion.div>
  )
}

/**
 * PeekingCard - Simplified card that shows just the top edge
 * Non-interactive, just visual indicator of stacked entities
 */
function PeekingCard({ entity }) {
  const { type, name, color } = entity
  const godColors = useStore(s => s.godColors)

  // Get entity color - theme color for gods, custom color for others
  const entityColor = type === 'god'
    ? (godColors[name?.toLowerCase()] || color || '#888')
    : (color || '#888')

  return (
    <div
      className="liquid-glass-god-tinted overflow-hidden"
      style={{
        '--god-color': entityColor,
        borderRadius: '12px 16px 16px 12px',
        borderRight: `4px solid ${entityColor}66`,
        height: 32,  // Just show header height
      }}
    >
      <div className="flex items-center h-8 px-3 gap-2">
        <span className="text-sm font-medium text-white/70 truncate">
          {name}
        </span>
      </div>
    </div>
  )
}
