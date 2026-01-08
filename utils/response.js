export const successResponse = (res, data, message = "Success", meta = {}) => {
  return res.json({
    success: true,
    message,
    meta,
    data,
  });
};

export const handleError = (res, error, message = "Error") => {
  console.error(error);
  return res.status(500).json({
    success: false,
    message,
    error: error?.message || error,
  });
};


export default {
  successResponse,
  handleError
}
