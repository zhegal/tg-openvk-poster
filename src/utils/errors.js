export function errorToString(error) {
  if (!error) return 'Unknown error';
  if (error.response?.data) {
    return `${error.message}: ${JSON.stringify(error.response.data)}`;
  }
  return error.stack || error.message || String(error);
}
