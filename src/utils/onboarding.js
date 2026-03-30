export function onboardingKey(userId) {
  return userId ? `dhw:onboarding:${userId}` : null
}

export function markOnboardingPending(userId) {
  const key = onboardingKey(userId)
  if (key) localStorage.setItem(key, 'pending')
}

export function markOnboardingComplete(userId) {
  const key = onboardingKey(userId)
  if (key) localStorage.setItem(key, 'done')
}

export function shouldShowOnboarding(userId) {
  const key = onboardingKey(userId)
  if (!key) return false
  return localStorage.getItem(key) === 'pending'
}
