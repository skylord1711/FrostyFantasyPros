export function offlineTutorProvider() {
  return {
    id: 'offline',
    label: 'Offline tutor',
    model: 'deterministic',
    async complete(req: any) {
      const last = req.messages[req.messages.length - 1]?.content || ''
      return {
        content: 'Offline: ' + last.slice(0, 120),
        provider: 'offline',
        model: 'deterministic',
        degraded: true
      }
    }
  }
}
