import Store from 'electron-store';
import { v4 as uuid } from 'uuid';
import type { Rule } from '../../shared/types';

interface RulesData {
  rules: Rule[];
}

export class RulesStore {
  private store: Store<RulesData>;

  constructor() {
    this.store = new Store<RulesData>({
      name: 'rules',
      defaults: {
        rules: [],
      },
    });
  }

  async list(): Promise<Rule[]> {
    return this.store.get('rules', []);
  }

  async add(rule: Omit<Rule, 'id' | 'createdAt' | 'updatedAt'>): Promise<Rule> {
    const rules = this.store.get('rules', []);
    const now = Date.now();

    const newRule: Rule = {
      ...rule,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    } as Rule;

    rules.push(newRule);
    this.store.set('rules', rules);

    return newRule;
  }

  async update(rule: Rule): Promise<Rule> {
    const rules = this.store.get('rules', []);
    const index = rules.findIndex((r) => r.id === rule.id);

    if (index === -1) {
      throw new Error(`Rule not found: ${rule.id}`);
    }

    const updatedRule: Rule = {
      ...rule,
      updatedAt: Date.now(),
    };

    rules[index] = updatedRule;
    this.store.set('rules', rules);

    return updatedRule;
  }

  async delete(id: string): Promise<void> {
    const rules = this.store.get('rules', []);
    const filtered = rules.filter((r) => r.id !== id);
    this.store.set('rules', filtered);
  }

  async toggle(id: string): Promise<Rule> {
    const rules = this.store.get('rules', []);
    const index = rules.findIndex((r) => r.id === id);

    if (index === -1) {
      throw new Error(`Rule not found: ${id}`);
    }

    rules[index] = {
      ...rules[index],
      enabled: !rules[index].enabled,
      updatedAt: Date.now(),
    };

    this.store.set('rules', rules);
    return rules[index];
  }

  async reorder(ids: string[]): Promise<void> {
    const rules = this.store.get('rules', []);
    const reordered: Rule[] = [];

    // First add rules in the new order
    for (const id of ids) {
      const rule = rules.find((r) => r.id === id);
      if (rule) {
        reordered.push(rule);
      }
    }

    // Add any rules not in the ids list (shouldn't happen, but safety)
    for (const rule of rules) {
      if (!ids.includes(rule.id)) {
        reordered.push(rule);
      }
    }

    // Update priority based on position
    reordered.forEach((rule, index) => {
      rule.priority = reordered.length - index;
    });

    this.store.set('rules', reordered);
  }

  async importRules(data: string): Promise<Rule[]> {
    try {
      const imported = JSON.parse(data) as Rule[];
      const rules = this.store.get('rules', []);
      const now = Date.now();

      // Add imported rules with new IDs
      const newRules = imported.map((rule) => ({
        ...rule,
        id: uuid(),
        createdAt: now,
        updatedAt: now,
      }));

      this.store.set('rules', [...rules, ...newRules]);
      return newRules;
    } catch {
      throw new Error('Invalid rules data');
    }
  }

  async exportRules(): Promise<string> {
    const rules = this.store.get('rules', []);
    return JSON.stringify(rules, null, 2);
  }
}
