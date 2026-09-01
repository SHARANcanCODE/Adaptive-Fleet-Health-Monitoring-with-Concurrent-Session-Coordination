/**
 * Tests for AnomalyBadge component
 */

import { render, screen } from '@testing-library/react';
import AnomalyBadge from '../AnomalyBadge';

describe('AnomalyBadge', () => {
  it('renders anomaly badge when flagged', () => {
    render(
      <AnomalyBadge
        score={5.2}
        type="isoforest"
        flagged={true}
      />
    );

    expect(screen.getByText(/Anomaly/i)).toBeInTheDocument();
  });

  it('does not render when not flagged', () => {
    const { container } = render(
      <AnomalyBadge
        score={1.2}
        type="zscore"
        flagged={false}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});

