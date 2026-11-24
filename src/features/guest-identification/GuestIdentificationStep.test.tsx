import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GuestIdentificationStep } from './GuestIdentificationStep'
import { readGuestIdentification, saveGuestIdentification } from './guestIdentificationStorage'

const notice = { code: 'aviso-v1', body: 'Aviso sintético.' }
const record = { eventCode: 'A'.repeat(43), guestName: 'Ana', noticeCode: notice.code, acceptedAt: '2032-02-29T03:00:00.000Z' }

function openStep() {
  const onConfirm = vi.fn()
  const app = render(<GuestIdentificationStep eventCode={record.eventCode} notice={notice} onConfirm={onConfirm} />)
  const continueStep = () => fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  return { app, onConfirm, continueStep }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

it('reutiliza a concordância original somente após continuar', () => {
  saveGuestIdentification(record)
  const { onConfirm, continueStep } = openStep()
  expect(screen.getByText(record.guestName)).toBeTruthy()
  expect(onConfirm).not.toHaveBeenCalled()
  continueStep()
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ identification: record, remembered: true })
})

it('oferece edição com concordância desmarcada e atualiza só após novo aceite', () => {
  saveGuestIdentification(record)
  const { onConfirm, continueStep } = openStep()
  fireEvent.click(screen.getByRole('button', { name: 'Editar nome' }))
  const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Nome ou apelido' })
  const consent = screen.getByRole<HTMLInputElement>('checkbox')
  expect(name.value).toBe(record.guestName)
  expect(document.activeElement).toBe(name)
  expect(consent.checked).toBe(false)
  fireEvent.change(name, { target: { value: ' Bia ' } })
  continueStep()
  expect(onConfirm).not.toHaveBeenCalled()
  expect(readGuestIdentification(record.eventCode, notice.code)).toEqual(record)
  fireEvent.click(consent)
  continueStep()
  const updated = readGuestIdentification(record.eventCode, notice.code)
  expect(updated?.guestName).toBe('Bia')
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ identification: updated, remembered: true })
})

it('pede nova confirmação após remoção dos dados entre abrir e continuar', () => {
  saveGuestIdentification(record)
  const { onConfirm, continueStep } = openStep()
  localStorage.clear()
  continueStep()
  expect(onConfirm).not.toHaveBeenCalled()
  const name = screen.getByRole<HTMLInputElement>('textbox', { name: 'Nome ou apelido' })
  expect(name.value).toBe('')
  expect(document.activeElement).toBe(name)
  expect(screen.getByRole('status').textContent).toContain('Informe seu nome e confirme o aviso para este evento.')
})

it('mostra o registro atualizado em outra aba antes de aceitar continuar com ele', () => {
  saveGuestIdentification(record)
  const { onConfirm, continueStep } = openStep()
  const updated = { ...record, guestName: 'Bia' }
  saveGuestIdentification(updated)
  continueStep()
  expect(onConfirm).not.toHaveBeenCalled()
  expect(screen.getByText('Bia')).toBeTruthy()
  continueStep()
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ identification: updated, remembered: true })
})

it('zera a identificação visível ao trocar de evento ou versão do aviso', () => {
  saveGuestIdentification(record)
  const { app, onConfirm } = openStep()
  app.rerender(<GuestIdentificationStep eventCode={'B'.repeat(43)} notice={notice} onConfirm={onConfirm} />)
  expect(screen.queryByText(record.guestName)).toBeNull()
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false)
  app.rerender(<GuestIdentificationStep eventCode={record.eventCode} notice={{ ...notice, code: 'aviso-v2' }} onConfirm={onConfirm} />)
  expect(screen.queryByText(record.guestName)).toBeNull()
  expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false)
  expect(onConfirm).not.toHaveBeenCalled()
})

it('entrega a confirmação da página quando a gravação falha', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Cheio', 'QuotaExceededError') })
  const { onConfirm, continueStep } = openStep()
  fireEvent.change(screen.getByRole('textbox', { name: 'Nome ou apelido' }), { target: { value: 'Bia' } })
  fireEvent.click(screen.getByRole('checkbox'))
  continueStep()
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
    identification: expect.objectContaining({ eventCode: record.eventCode, guestName: 'Bia', noticeCode: notice.code }), remembered: false,
  })
})
