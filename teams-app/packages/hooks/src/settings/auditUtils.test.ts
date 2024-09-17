import { describe, it, expect } from 'vitest';
import { hasSeatsForRoleChange, RoleData } from './auditUtils';

// Test Suite
describe('hasSeatsForRoleChange, when collaborator are not users', () => {
  const testData: RoleData = {
    USERS: {
      role: 'Users',
      current: 10,
      remaining: 5,
      text: '5 users remaining'
    },
    COLLABORATORS: {
      role: 'Collaborator',
      current: 3,
      remaining: 2,
      text: '2 collaborators remaining'
    },
    GUESTS: {
      role: 'Guest',
      current: 7,
      remaining: 1,
      text: '1 guest remaining'
    }
  };

  it('should return false if test data is undefined', () => {
    expect(hasSeatsForRoleChange(undefined, 'GUEST')).toBe(false);
  });

  it('should return false if role is empty', () => {
    expect(hasSeatsForRoleChange(testData, '')).toBe(false);
  });

  it('should return false if no seats left for GUEST role', () => {
    const data = { ...testData, GUESTS: { ...testData.GUESTS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'GUEST')).toBe(false);
  });

  it('should return true if seats are available for GUEST role', () => {
    expect(hasSeatsForRoleChange(testData, 'GUEST')).toBe(true);
  });

  it('should return false if no seats left for COLLABORATOR role and USERS have seats', () => {
    const data = {
      ...testData,
      COLLABORATORS: { ...testData.COLLABORATORS, remaining: 0 }
    };
    expect(hasSeatsForRoleChange(data, 'COLLABORATOR')).toBe(false);
  });

  it('should return true if seats are available for COLLABORATOR role', () => {
    expect(hasSeatsForRoleChange(testData, 'COLLABORATOR')).toBe(true);
  });

  it('should return true for MEMBER role if current role is ADMIN and no user seats left', () => {
    const data = { ...testData, USERS: { ...testData.USERS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'MEMBER', 'ADMIN')).toBe(true);
  });

  it('should return false for MEMBER role if no seats left', () => {
    const data = { ...testData, USERS: { ...testData.USERS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'MEMBER')).toBe(false);
  });

  it('should return true for ADMIN role if current role is MEMBER and no user seats left', () => {
    const data = { ...testData, USERS: { ...testData.USERS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'ADMIN', 'MEMBER')).toBe(true);
  });

  it('should return false for ADMIN role if no seats left', () => {
    const data = { ...testData, USERS: { ...testData.USERS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'ADMIN')).toBe(false);
  });

  it('should return true if seats are available for any role', () => {
    expect(hasSeatsForRoleChange(testData, 'ADMIN')).toBe(true);
    expect(hasSeatsForRoleChange(testData, 'MEMBER')).toBe(true);
    expect(hasSeatsForRoleChange(testData, 'COLLABORATOR')).toBe(true);
    expect(hasSeatsForRoleChange(testData, 'GUEST')).toBe(true);
  });
});

describe('hasSeatsForRoleChange, with collaborator are users', () => {
  const dummyData: RoleData = {
    USERS: {
      role: 'Users',
      current: 10,
      remaining: 5,
      text: '5 users remaining'
    },
    COLLABORATORS: {
      role: 'Collaborators',
      current: undefined,
      remaining: undefined,
      text: ''
    },
    GUESTS: {
      role: 'Guest',
      current: 7,
      remaining: 1,
      text: '1 guest remaining'
    }
  };

  it('should return false if test data is undefined', () => {
    expect(hasSeatsForRoleChange(undefined, 'GUEST')).toBe(false);
  });

  it('should return false if role is empty', () => {
    expect(hasSeatsForRoleChange(dummyData, '')).toBe(false);
  });

  it('should return false if no seats left for GUEST role', () => {
    const data = { ...dummyData, GUESTS: { ...dummyData.GUESTS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'GUEST')).toBe(false);
  });

  it('should return true if seats are available for GUEST role', () => {
    expect(hasSeatsForRoleChange(dummyData, 'GUEST')).toBe(true);
  });

  it('should return false if no seats left for COLLABORATOR role and USERS have seats', () => {
    const data = {
      ...dummyData,
      COLLABORATORS: { ...dummyData.COLLABORATORS, remaining: 0 }
    };
    expect(hasSeatsForRoleChange(data, 'COLLABORATOR')).toBe(true);
  });

  it('should return true if seats are available for COLLABORATOR role', () => {
    expect(hasSeatsForRoleChange(dummyData, 'COLLABORATOR')).toBe(true);
  });

  it('should return true for MEMBER role if current role is ADMIN and no user seats left', () => {
    const data = { ...dummyData, USERS: { ...dummyData.USERS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'MEMBER', 'ADMIN')).toBe(true);
  });

  it('should return false for MEMBER role if no seats left', () => {
    const data = { ...dummyData, USERS: { ...dummyData.USERS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'MEMBER')).toBe(false);
  });

  it('should return true for ADMIN role if current role is MEMBER and no user seats left', () => {
    const data = { ...dummyData, USERS: { ...dummyData.USERS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'ADMIN', 'MEMBER')).toBe(true);
  });

  it('should return false for ADMIN role if no seats left', () => {
    const data = { ...dummyData, USERS: { ...dummyData.USERS, remaining: 0 } };
    expect(hasSeatsForRoleChange(data, 'ADMIN')).toBe(false);
  });

  it('should return true if seats are available for any role', () => {
    expect(hasSeatsForRoleChange(dummyData, 'ADMIN')).toBe(true);
    expect(hasSeatsForRoleChange(dummyData, 'MEMBER')).toBe(true);
    expect(hasSeatsForRoleChange(dummyData, 'COLLABORATOR')).toBe(true);
    expect(hasSeatsForRoleChange(dummyData, 'GUEST')).toBe(true);
  });
});