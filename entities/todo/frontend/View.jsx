import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPlus,
  faTrash,
  faCheck,
  faCircle
} from '@fortawesome/free-solid-svg-icons'
import { Input, IconButton } from '../../_ui'

const DEFAULT_STATE = {
  items: [],
  filter: 'all' // 'all' | 'active' | 'completed'
}

export default function TodoView({ entity, send }) {
  const entityId = entity?.id
  const data = entity?.data || DEFAULT_STATE

  const [newTodo, setNewTodo] = useState('')

  const items = data.items || []
  const filter = data.filter || 'all'

  const filteredItems = items.filter(item => {
    if (filter === 'active') return !item.done
    if (filter === 'completed') return item.done
    return true
  })

  const activeCount = items.filter(i => !i.done).length
  const completedCount = items.filter(i => i.done).length

  const updateData = (newData) => {
    send({
      event: 'entity:update-data',
      entityId,
      data: { ...data, ...newData }
    })
  }

  const handleAdd = (e) => {
    e.preventDefault()
    if (!newTodo.trim()) return

    const newItem = {
      id: crypto.randomUUID(),
      text: newTodo.trim(),
      done: false,
      createdAt: Date.now()
    }

    updateData({ items: [...items, newItem] })
    setNewTodo('')
  }

  const handleToggle = (id) => {
    updateData({
      items: items.map(item =>
        item.id === id ? { ...item, done: !item.done } : item
      )
    })
  }

  const handleDelete = (id) => {
    updateData({ items: items.filter(item => item.id !== id) })
  }

  const handleClearCompleted = () => {
    updateData({ items: items.filter(item => !item.done) })
  }

  const handleSetFilter = (newFilter) => {
    updateData({ filter: newFilter })
  }

  return (
    <div className="h-full flex flex-col bg-surface/50">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            placeholder="What needs to be done?"
            className="flex-1"
          />
          <button
            type="submit"
            disabled={!newTodo.trim()}
            className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 rounded-lg text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </form>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
            {filter === 'all' ? 'No todos yet' :
             filter === 'active' ? 'No active todos' : 'No completed todos'}
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {filteredItems.map(item => (
              <li
                key={item.id}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
              >
                <button
                  onClick={() => handleToggle(item.id)}
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    item.done
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-white/30 hover:border-emerald-500/50'
                  }`}
                >
                  {item.done && <FontAwesomeIcon icon={faCheck} className="text-xs" />}
                </button>

                <span className={`flex-1 text-sm ${
                  item.done ? 'text-text-tertiary line-through' : 'text-text-primary'
                }`}>
                  {item.text}
                </span>

                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1 opacity-0 group-hover:opacity-100 text-red-400/50 hover:text-red-400 transition-all"
                >
                  <FontAwesomeIcon icon={faTrash} className="text-xs" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs text-text-tertiary">
          <span>{activeCount} item{activeCount !== 1 ? 's' : ''} left</span>

          <div className="flex gap-1">
            {['all', 'active', 'completed'].map(f => (
              <button
                key={f}
                onClick={() => handleSetFilter(f)}
                className={`px-2 py-1 rounded transition-colors ${
                  filter === f
                    ? 'bg-white/10 text-text-primary'
                    : 'hover:bg-white/5 text-text-tertiary'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {completedCount > 0 && (
            <button
              onClick={handleClearCompleted}
              className="hover:text-text-secondary transition-colors"
            >
              Clear completed
            </button>
          )}
        </div>
      )}
    </div>
  )
}
