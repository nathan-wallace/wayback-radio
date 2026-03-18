import React from 'react';
import { metadataFieldSchema } from '../config/metadataFields';

function renderLinkList(items = []) {
  return items.map((item) => (
    <li key={item.url}>
      <a href={item.url} target="_blank" rel="noopener noreferrer">
        {item.label}
      </a>
    </li>
  ));
}

function renderDetailsItems(field, value) {
  if (field.itemRenderType === 'link') {
    return <ul>{renderLinkList(value)}</ul>;
  }

  return (
    <ul>
      {value.map((item) => (
        <li key={`${field.key}-${item.label}`}>
          <strong>{item.label}:</strong> {item.value}
        </li>
      ))}
    </ul>
  );
}

function renderField(field, metadata) {
  const rawValue = metadata[field.key];
  const value = field.formatter ? field.formatter(rawValue, metadata) : rawValue;

  switch (field.renderType) {
    case 'text': {
      const content = field.emphasize ? <em>{value}</em> : value;

      if (field.className === 'metadata-title') {
        return <strong className={field.className}>{field.label}: {content}</strong>;
      }

      if (field.compact) {
        return <small className={field.className}>{content}</small>;
      }

      if (field.inlineLabel) {
        return (
          <p className={field.className}>
            <strong>{field.label}:</strong> {content}
          </p>
        );
      }

      return (
        <p className={field.className}>
          {field.label && <strong>{field.label}:</strong>}
          {field.label ? ' ' : ''}
          {content}
        </p>
      );
    }
    case 'list':
      return <ul>{value.map((item, index) => <li key={`${field.key}-${index}`}>{item}</li>)}</ul>;
    case 'link': {
      const links = Array.isArray(value) ? value : [];
      if (links.length === 1) {
        const [item] = links;
        return (
          <p>
            <strong>{field.label}:</strong>
            <br />
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.label}
            </a>
          </p>
        );
      }

      return (
        <div>
          <strong>{field.label}:</strong>
          <ul>{renderLinkList(links)}</ul>
        </div>
      );
    }
    case 'image':
      return (
        <img
          src={value.src}
          alt={value.alt}
          style={{ maxWidth: '100px', marginTop: '0.5rem', borderRadius: '4px' }}
        />
      );
    case 'details':
      return (
        <details>
          <summary><strong>{field.label}</strong></summary>
          {renderDetailsItems(field, value)}
        </details>
      );
    default:
      return null;
  }
}

export default function MetadataPanel({ metadata }) {
  if (!metadata) return null;

  return (
    <div className="now-playing">
      {metadataFieldSchema.map((field) => {
        if (!field.isVisible(metadata)) {
          return null;
        }

        return (
          <div key={field.key} className={`metadata-field metadata-field-${field.renderType}`}>
            {renderField(field, metadata)}
          </div>
        );
      })}
    </div>
  );
}
