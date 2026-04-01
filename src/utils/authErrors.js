export function friendlyAuthError(message, fallback = 'Something went wrong') {
  const text = (message || '').toLowerCase()

  if (text.includes('email rate limit exceeded') || text.includes('rate limit exceeded')) {
    return 'Too many email attempts were made in a short time. Please wait a few minutes and try again.'
  }

  if (text.includes('too many requests')) {
    return 'Too many requests were made too quickly. Please wait a moment and try again.'
  }

  return message || fallback
}
