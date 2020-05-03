import React from 'react';
import Linkify from 'react-linkify';
import PropTypes from 'prop-types';
import { ReactTinyLink } from 'react-tiny-link'

const urlsRegex = /(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/gi;

const TextMessage = ({ isMyComment, colorTheme, messageObj }) => {
  const links = messageObj.message.match(urlsRegex);
  const linksElements = links && links.length > 0
    ? links.map(link => (
      <div className="sc-message-link-preview" key={link}>
          <br />
          <ReactTinyLink
            cardSize="small"
            showGraphic={true}
            maxLine={0}
            minLine={0}
            url={link}
            autoPlay={false}
            header={null}
            description={null}
          />
        </div>
      ))
    : <div></div>;

  return <div
    className="sc-message--text"
    style={{ backgroundColor: isMyComment && colorTheme ? colorTheme : {}}}
  >
    <Linkify properties={{ target: '_blank' }}>
      {messageObj.message}
    </Linkify>

    { linksElements }

  </div>
};

TextMessage.propTypes = {
  isMyComment: PropTypes.bool,
  colorTheme: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  messageObj: PropTypes.object,
};

export default TextMessage;
