export const successResponse = (res, data, message = "Success", meta = {}) => {
  return res.json({
    success: true,
    message,
    meta,
    data,
  });
};

export const handleError = (res, message, statusCode = 500) => {
  // Strip HTML tags from error messages (e.g., WordPress errors)
  const cleanMessage = typeof message === 'string'
    ? message.replace(/<[^>]*>/g, '').trim()
    : message;

  return res.status(statusCode).json({
    success: false,
    message: cleanMessage,
  });
};


export default {
  successResponse,
  handleError
}
