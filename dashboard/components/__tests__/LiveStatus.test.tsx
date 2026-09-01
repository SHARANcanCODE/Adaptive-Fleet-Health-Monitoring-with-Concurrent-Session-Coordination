/**
 * Tests for LiveStatus component
 */

import { render, screen } from '@testing-library/react';
import LiveStatus from '../LiveStatus';

// Mock socket
jest.mock('@/lib/socket', () => ({
  getSocket: jest.fn().mockReturnValue({
    on: jest.fn(),
    off: jest.fn(),
    connected: false,
  }),
}));

describe('LiveStatus', () => {
  it('renders without crashing', () => {
    render(<LiveStatus />);
    expect(screen.getByText(/Live|Disconnected/i)).toBeInTheDocument();
  });
});

