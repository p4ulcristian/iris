import { Reorder, AnimatePresence, motion } from 'framer-motion'
import EntityCard from './EntityCard'
import EntityGroup from './EntityGroup'
import DraggableTypeButton from './DraggableTypeButton'
import TileUngroupDropZone from './TileUngroupDropZone'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEye } from '@fortawesome/free-solid-svg-icons'
import { EntityIcon } from '../entities'

// Animation timing (in ms)
const CARDS_DURATION = 200
const ICONS_DURATION = 200
const WIDTH_DURATION = 150
const BUTTON_DURATION = 150

export default function RightSidebar({
  // Data
  activeStages,
  activeEntities,
  tabs,
  activeTabId,
  focusedEntity,
  effectiveFocusedEntity,
  godColors,
  loadStage,
  initialLoadDone,

  // Sidebar state
  sidebarCollapsed,
  sidebarShowCards,
  sidebarShowIcons,
  sidebarButtonsExpanded,
  setSidebarButtonsExpanded,

  // Handlers
  onSidebarToggle,
  onEntityClick,
  onEntityClose,
  onEntitySplit,
  onMoveToTab,
  onMoveToNewTab,
  onEntityReorder,
  onStagesReorder,
  onSpawnEntity,
  onSpawnTerminal,
  onOpenSummonModal,
}) {
  return (
    <motion.div
      className="flex flex-col overflow-visible relative pl-3"
      animate={{
        width: sidebarCollapsed ? 48 : 288
      }}
      transition={{
        duration: WIDTH_DURATION / 1000,
        ease: 'easeInOut'
      }}
    >
      {/* Two card sets with choreographed animations */}
      <TileUngroupDropZone className="flex-1 relative overflow-hidden pb-14">
        {/* Full task cards - slide up to exit, slide down to enter */}
        <AnimatePresence>
          {sidebarShowCards && (
            <motion.div
              key="cards"
              className="absolute inset-0 overflow-y-auto overflow-x-visible pb-16"
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ duration: CARDS_DURATION / 1000, ease: 'easeInOut' }}
            >
              {activeStages.length > 0 ? (
                <Reorder.Group
                  axis="y"
                  values={activeStages}
                  onReorder={onStagesReorder}
                  className="flex flex-col gap-3"
                >
                  {activeStages.map((stage, stageIdx) => {
                    const activeTab = tabs.find(t => t.id === activeTabId)
                    const isActiveStage = stage.id === activeTab?.activeStageId
                    // Calculate stagger offset: sum of entities in previous stages
                    const staggerOffset = activeStages
                      .slice(0, stageIdx)
                      .reduce((sum, s) => sum + s.entities.length, 0)
                    return (
                      <EntityGroup
                        key={stage.id}
                        stage={stage}
                        entities={stage.entities}
                        isFocused={isActiveStage}
                        focusedEntityId={focusedEntity}
                        onClick={onEntityClick}
                        onClose={onEntityClose}
                        onSplit={(entityId) => onEntitySplit(entityId, stage.id)}
                        tabs={tabs}
                        activeTabId={activeTabId}
                        onMoveToTab={onMoveToTab}
                        onMoveToNewTab={onMoveToNewTab}
                        staggerOffset={staggerOffset}
                      />
                    )
                  })}
                </Reorder.Group>
              ) : activeEntities.length > 0 ? (
                /* Fallback: no stages data, render flat entity list */
                <Reorder.Group
                  axis="y"
                  values={activeEntities}
                  onReorder={onEntityReorder}
                  className="flex flex-col gap-3"
                >
                  {activeEntities.map((entity, idx) => (
                    <EntityCard
                      key={entity.id}
                      entity={entity}
                      isActive={entity.id === effectiveFocusedEntity}
                      onClick={() => onEntityClick(entity.id)}
                      onClose={() => onEntityClose(entity.id)}
                      tabs={tabs}
                      activeTabId={activeTabId}
                      onMoveToTab={onMoveToTab}
                      onMoveToNewTab={onMoveToNewTab}
                      staggerIndex={idx}
                    />
                  ))}
                </Reorder.Group>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-text-secondary text-sm">
                  <p>Add an entity</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Icon strip - slide up from bottom to enter, slide down to exit */}
        <AnimatePresence>
          {sidebarShowIcons && (
            <motion.div
              key="icons"
              className="absolute inset-0 overflow-y-auto overflow-x-hidden flex flex-col items-center gap-1.5 pt-1"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: ICONS_DURATION / 1000, ease: 'easeInOut' }}
            >
              {activeEntities.map((entity) => {
                const entityColor = entity.type === 'god'
                  ? (godColors[entity.name?.toLowerCase()] || entity.color || '#888')
                  : (entity.color || '#888')
                return (
                  <motion.button
                    key={entity.id}
                    onClick={() => onEntityClick(entity.id)}
                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg cursor-pointer transition-all hover:bg-white/10"
                    style={{
                      backgroundColor: entity.id === effectiveFocusedEntity ? `${entityColor}33` : 'transparent',
                      border: `2px solid ${entity.id === effectiveFocusedEntity ? entityColor : 'transparent'}`
                    }}
                    title={entity.displayName || entity.name}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <EntityIcon type={entity.type} />
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>

      </TileUngroupDropZone>

      {/* Eye button + Summon menu container - outside TileUngroupDropZone for overflow */}
      <motion.div
        className="absolute bottom-0 inset-x-0 z-10 flex flex-col items-center"
        initial={{ y: 20, opacity: 0 }}
        animate={{
          y: loadStage >= 5 ? 0 : 20,
          opacity: loadStage >= 5 ? 1 : 0
        }}
        transition={{
          duration: BUTTON_DURATION / 1000,
          ease: 'easeInOut',
          delay: (!initialLoadDone || loadStage < 5) ? 0.2 : 0
        }}
        onMouseEnter={() => setSidebarButtonsExpanded(true)}
        onMouseLeave={() => setSidebarButtonsExpanded(false)}
      >
        {/* Summon menu - positioned above eye, centered */}
        <AnimatePresence>
          {sidebarButtonsExpanded && (
            <motion.div
              className={`absolute bottom-full mb-2 flex flex-col gap-3 items-center p-2 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 ${
                sidebarCollapsed ? 'right-0' : 'left-1/2 -translate-x-1/2'
              }`}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* System */}
              <div className="flex gap-1.5">
                <DraggableTypeButton
                  entityType="settings"
                  title="Settings - drag to split"
                  onClick={() => onSpawnEntity('settings')}
                />
                <DraggableTypeButton
                  entityType="cemetery"
                  title="Cemetery - drag to split"
                  onClick={() => onSpawnEntity('cemetery')}
                />
              </div>

              {/* Social & Media */}
              <div className="flex gap-1.5">
                <DraggableTypeButton
                  entityType="youtube-music"
                  title="YouTube Music - drag to split"
                  onClick={() => onSpawnEntity('youtube-music')}
                />
                <DraggableTypeButton
                  entityType="messenger"
                  title="Messenger - drag to split"
                  onClick={() => onSpawnEntity('messenger')}
                />
                <DraggableTypeButton
                  entityType="discord"
                  title="Discord - drag to split"
                  onClick={() => onSpawnEntity('discord')}
                />
                <DraggableTypeButton
                  entityType="rsvp"
                  title="RSVP Speed Reader - drag to split"
                  onClick={() => onSpawnEntity('rsvp')}
                />
              </div>

              {/* Productivity */}
              <div className="flex gap-1.5">
                <DraggableTypeButton
                  entityType="linear"
                  title="Linear - drag to split"
                  onClick={() => onSpawnEntity('linear')}
                />
                <DraggableTypeButton
                  entityType="calendar"
                  title="Calendar - drag to split"
                  onClick={() => onSpawnEntity('calendar')}
                />
                <DraggableTypeButton
                  entityType="history"
                  title="History - drag to split"
                  onClick={() => onSpawnEntity('history')}
                />
                <DraggableTypeButton
                  entityType="oracle"
                  title="Oracle (Local LLM) - drag to split"
                  onClick={() => onSpawnEntity('oracle')}
                />
                <DraggableTypeButton
                  entityType="pomodoro"
                  title="Pomodoro Timer - drag to split"
                  onClick={() => onSpawnEntity('pomodoro')}
                />
                <DraggableTypeButton
                  entityType="todo"
                  title="Todo List - drag to split"
                  onClick={() => onSpawnEntity('todo')}
                />
              </div>

              {/* Dev Tools */}
              <div className="flex gap-1.5">
                <DraggableTypeButton
                  entityType="terminal"
                  title="New terminal (Alt+R) - drag to split"
                  onClick={onSpawnTerminal}
                />
                <DraggableTypeButton
                  entityType="code"
                  title="Code viewer - drag to split"
                  onClick={() => onSpawnEntity('code')}
                />
                <DraggableTypeButton
                  entityType="git"
                  title="Git - drag to split"
                  onClick={() => onSpawnEntity('git')}
                />
                <DraggableTypeButton
                  entityType="browser"
                  title="New browser - drag to split"
                  onClick={() => onSpawnEntity('browser')}
                />
                <DraggableTypeButton
                  entityType="draw"
                  title="Draw (SVG generator) - drag to split"
                  onClick={() => onSpawnEntity('draw')}
                />
              </div>

              {/* Divider */}
              <div className="w-full h-px bg-white/10" />

              {/* Primary: God & Personalities (large) - closest to eye */}
              <div className="flex gap-2">
                <DraggableTypeButton
                  entityType="god"
                  title="New god (Alt+N) - drag to split"
                  onClick={onOpenSummonModal}
                  size="large"
                />
                <DraggableTypeButton
                  entityType="personalities"
                  title="Personalities - drag to split"
                  onClick={() => onSpawnEntity('personalities')}
                  size="large"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Eye button */}
        <button
          onClick={() => onSidebarToggle()}
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-teal-500/30 backdrop-blur-md border border-white/10 text-white/80 hover:bg-teal-500/50 hover:text-white transition-all cursor-pointer"
          title={sidebarCollapsed ? 'Expand sidebar (Alt+B)' : 'Collapse sidebar (Alt+B)'}
        >
          <FontAwesomeIcon
            icon={faEye}
            className="w-4 h-4"
          />
        </button>
      </motion.div>
    </motion.div>
  )
}
