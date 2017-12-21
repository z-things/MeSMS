/**
 * Created by jacky on 2017/2/4.
 */
'use strict';
var util = require('util');
var aliSms=require('@alicloud/sms-sdk');
var aliConf = require('./config.js').Ali;
var twilioConf = require('./config.js').Twilio;
var sendInterval = require('./config.js').Interval;
var logger = require('./../mlogger/mlogger');
var VirtualDevice = require('./../virtual-device').VirtualDevice;
var OPERATION_SCHEMAS = {
    sendMessage: {
        "type": "object",
        "properties": {
            "sendTo": {"type": "string"},
            "conditional": {
                "type": "object",
                "properties": {
                    "properties": {
                        "anyOf": [
                            {
                                messageText: {"type": "string"}
                            },
                            {
                                mediaUrl: {"type": "string"}
                            }
                        ]
                    }
                }
            },
            "statusCallback": {
                "type": "string"
            }
        },
        "required": ["sendTo", "conditional"]
    }
};

var numberIndex = 0;
var getPhoneNumber = function () {
    if (numberIndex + 1 > twilioConf.Numbers.length) {
        numberIndex = 0;
    }
    return twilioConf.Numbers[numberIndex++];
};

function SMS(conx, uuid, token, configurator) {
    this.twilioClient = null;

    this.sendHistory = {};
    VirtualDevice.call(this, conx, uuid, token, configurator);
}
util.inherits(SMS, VirtualDevice);

SMS.prototype.init = function () {
    var accountSid = twilioConf.AccountSID;
    var authToken = twilioConf.AuthToken;
    this.twilioClient = require('twilio')(accountSid, authToken);
    this.aliClient = new aliSms(aliConf.AccessKeyId, aliConf.SecretAccessKey);
};

/**
 * 远程RPC回调函数
 * @callback onMessage~sendMessage
 * @param {object} response:
 * {
 *      "retCode":{number},
 *      "description":{string},
 *      "data":{object}
 *  }
 */
/**
 * 发送短信
 * @param {object} message :消息体
 * @param {onMessage~sendMessage} peerCallback: 远程RPC回调函数
 * */
SMS.prototype.sendMessage = function (message, peerCallback) {
    var self = this;
    var responseMessage = {retCode: 200, description: "Success.", data: {}};
    self.messageValidate(message, OPERATION_SCHEMAS.sendMessage, function(error) {
        if (error) {
            responseMessage = error;
            peerCallback(error);
        }
        else{
            var messageInfo = message;
            var sendDate = new Date();
            logger.debug(sendDate.getTime() - self.sendHistory[messageInfo.sendTo]);
            if (!util.isNullOrUndefined(self.sendHistory[messageInfo.sendTo])) {
                if (sendDate.getTime() - self.sendHistory[messageInfo.sendTo] <= sendInterval*1000) {
                    logger.error(210001);
                    responseMessage.retCode = 210001;
                    responseMessage.description = logger.getErrorInfo(210001);
                    peerCallback(responseMessage);
                    return;
                }
            }
            else {
                self.sendHistory[messageInfo.sendTo] = sendDate.getTime();
            }
            var tempMessage = {
                to: messageInfo.sendTo,
                from: getPhoneNumber()
            };
            if (!util.isNullOrUndefined(messageInfo.conditional.messageText)) {
                tempMessage.body = messageInfo.conditional.messageText;
            }
            if (!util.isNullOrUndefined(messageInfo.conditional.mediaUrl)) {
                tempMessage.mediaUrl = messageInfo.conditional.mediaUrl;
            }
            if (!util.isNullOrUndefined(messageInfo.statusCallback)) {
                tempMessage.statusCallback = messageInfo.statusCallback;
            }
            self.twilioClient.messages.create(tempMessage, function (error, message) {
                if (error) {
                    var logError = {
                        errorId: 210002, errorMsg: error
                    };
                    logger.error(210002, error);
                    responseMessage.retCode = logError.errorId;
                    responseMessage.description = logError.errorMsg;
                }
                else {
                    responseMessage.data = message.sid;
                }
                logger.debug(responseMessage);
                peerCallback(responseMessage);
            });
        }
    });
};

module.exports = {
    Service: SMS,
    OperationSchemas: OPERATION_SCHEMAS
};