import React from 'react';
import Linkify from 'react-linkify';
import PropTypes from 'prop-types';
import LinkPreview from './LinkPreview';

const TextMessage = ({ isMyComment, colorTheme, messageObj }) => (
  <div
    className="sc-message--text"
    style={{ backgroundColor: isMyComment && colorTheme ? colorTheme : {}}}
  >
    <div className="text-body">
      <Linkify properties={{ target: '_blank' }}>
        {messageObj.message}
      </Linkify>
    </div>
    <LinkPreview messageObj={messageObj}></LinkPreview>
  </div>
);

TextMessage.propTypes = {
  isMyComment: PropTypes.bool,
  colorTheme: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  messageObj: PropTypes.object,
};

export default TextMessage;
