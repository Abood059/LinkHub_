'use strict';

const ErrorCentralService =
    require('./ErrorCentralService');

const {
    LOG_LEVELS,
    LOG_TYPES,
    LOG_SOURCES,
    SEVERITY
} = require('./logging.constants');

const errorCentralService =
    new ErrorCentralService();

module.exports = Object.freeze({
    errorCentralService,

    LOG_LEVELS,
    LOG_TYPES,
    LOG_SOURCES,
    SEVERITY
});