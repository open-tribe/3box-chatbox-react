import React from 'react';
import PropTypes from 'prop-types';
import { ReactTinyLink } from 'react-tiny-link'

const urlsRegex = /(https?:\/\/(?:www\.|(?!www))[^\s.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/gi;

const LinkPreview = ({ messageObj }) => {
  const links = messageObj.message.match(urlsRegex);
  const previews = links && links.length > 0
    ? links.map(link => (
      <div key={link}>
        <div className="line-break"></div>
        <ReactTinyLink
          cardSize="small"
          showGraphic={true}
          maxLine={1}
          minLine={1}
          url={link}
          autoPlay={false}
          header={null}
          description={null}
        />
      </div>
    ))
    : <div></div>;

  return <div
    className="sc-message-link-preview"
  >
    {previews}
  </div>
};

LinkPreview.propTypes = {
  messageObj: PropTypes.object,
};

export default LinkPreview;
