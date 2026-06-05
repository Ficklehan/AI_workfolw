import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface DropdownProps {
  value: string
  options: { label: string; value: string }[]
  onChange: (value: string) => void
  placeholder?: string
  minWidth?: number
}

export default function Dropdown({ value, options, onChange, placeholder = '请选择', minWidth = 120 }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedLabel = options.find(o => o.value === value)?.label || placeholder

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', minWidth }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 6, padding: '8px 12px', borderRadius: 8,
          background: 'var(--bg-primary)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          color: value ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: 13, cursor: 'pointer', transition: 'border-color 0.2s'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLabel}</span>
        <ChevronDown size={14} style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden', zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          maxHeight: 240, overflowY: 'auto'
        }}>
          {options.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                background: opt.value === value ? 'var(--accent)' : 'transparent',
                color: opt.value === value ? 'white' : 'var(--text-primary)',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (opt.value !== value) e.currentTarget.style.background = 'transparent' }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
