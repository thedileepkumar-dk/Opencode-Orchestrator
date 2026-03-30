import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';

interface AgentState {
  id: string;
  name: string;
  domain: string;
  status: 'idle' | 'busy' | 'error' | 'queued';
  task?: string;
  duration?: number;
}

interface TaskState {
  id: string;
  description: string;
  agent: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  duration?: number;
}

interface OrchestratorTUIProps {
  agents: AgentState[];
  tasks: TaskState[];
  mode: string;
  metrics: {
    total: number;
    active: number;
    completed: number;
    failed: number;
  };
}

const StatusIcon: Record<string, string> = {
  idle: '○',
  busy: '●',
  error: '✖',
  queued: '◌',
  pending: '○',
  in_progress: '◐',
  completed: '✔',
  failed: '✖',
};

const StatusColor: Record<string, string> = {
  idle: 'gray',
  busy: 'green',
  error: 'red',
  queued: 'yellow',
  pending: 'gray',
  in_progress: 'yellow',
  completed: 'green',
  failed: 'red',
};

export default function OrchestratorTUI({ agents, tasks, mode, metrics }: OrchestratorTUIProps) {
  const { exit } = useApp();
  const [selectedTab, setSelectedTab] = useState(0);
  const tabs = ['Agents', 'Tasks', 'Metrics', 'Log'];

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit();
    if (key.tab) setSelectedTab((prev) => (prev + 1) % tabs.length);
    if (input === '1') setSelectedTab(0);
    if (input === '2') setSelectedTab(1);
    if (input === '3') setSelectedTab(2);
    if (input === '4') setSelectedTab(3);
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan"> OpenCode Orchestrator </Text>
        <Text dimColor> — {mode} mode — Tab to switch panels, q to quit</Text>
      </Box>

      <Box paddingX={1} marginTop={1}>
        {tabs.map((tab, i) => (
          <Box key={tab} marginRight={2}>
            <Text bold={selectedTab === i} color={selectedTab === i ? 'cyan' : 'gray'}>
              {selectedTab === i ? `▸ ${tab}` : `  ${tab}`}
            </Text>
          </Box>
        ))}
      </Box>

      <Box borderStyle="single" borderColor="gray" padding={1} marginTop={1} flexDirection="column" minHeight={15}>
        {selectedTab === 0 && (
          <>
            <Text bold color="yellow">Agent Pool</Text>
            <Box marginTop={1} flexDirection="column">
              {agents.map((agent) => (
                <Box key={agent.id}>
                  <Text color={StatusColor[agent.status] as any}>
                    {StatusIcon[agent.status]} {agent.name.padEnd(16)}
                  </Text>
                  <Text dimColor> {agent.domain.padEnd(12)} </Text>
                  <Text color={StatusColor[agent.status] as any}>{agent.status}</Text>
                  {agent.task && <Text dimColor> — {agent.task}</Text>}
                </Box>
              ))}
            </Box>
          </>
        )}

        {selectedTab === 1 && (
          <>
            <Text bold color="yellow">Task Queue</Text>
            <Box marginTop={1} flexDirection="column">
              {tasks.slice(-12).map((task) => (
                <Box key={task.id}>
                  <Text color={StatusColor[task.status] as any}>
                    {StatusIcon[task.status]}
                  </Text>
                  <Text> {task.description.slice(0, 50).padEnd(52)} </Text>
                  <Text dimColor>{task.agent.padEnd(12)}</Text>
                  <Text color={StatusColor[task.status] as any}>{task.status}</Text>
                  {task.duration && <Text dimColor> {task.duration}ms</Text>}
                </Box>
              ))}
            </Box>
          </>
        )}

        {selectedTab === 2 && (
          <>
            <Text bold color="yellow">Metrics</Text>
            <Box marginTop={1}>
              <Box marginRight={4}>
                <Text color="cyan" bold>{metrics.total}</Text>
                <Text dimColor> total</Text>
              </Box>
              <Box marginRight={4}>
                <Text color="yellow" bold>{metrics.active}</Text>
                <Text dimColor> active</Text>
              </Box>
              <Box marginRight={4}>
                <Text color="green" bold>{metrics.completed}</Text>
                <Text dimColor> done</Text>
              </Box>
              <Box>
                <Text color="red" bold>{metrics.failed}</Text>
                <Text dimColor> failed</Text>
              </Box>
            </Box>
          </>
        )}

        {selectedTab === 3 && (
          <>
            <Text bold color="yellow">Activity Log</Text>
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Waiting for activity...</Text>
            </Box>
          </>
        )}
      </Box>

      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          [1] Agents  [2] Tasks  [3] Metrics  [4] Log  [Tab] Next  [q] Quit
        </Text>
      </Box>
    </Box>
  );
}
