module.exports = function filterAndDotifyKeys (app, secrets) {
  return Object.keys(secrets)
    .filter(k => new RegExp(`^${app}_`).test(k))
    .map(k => ({
      original: k,
      dotified: k.replace(new RegExp(`^(${app})_`), '$1.')
    }))
    .reduce(
      (acc, k) => ({ ...acc, [k.dotified]: secrets[k.original].value }),
      {}
    )
}
