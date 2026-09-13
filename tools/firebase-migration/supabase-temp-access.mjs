import { spawnSync } from 'node:child_process';

const TRUSTED_ROLES = new Set(['postgres', 'supabase_admin']);

export function getTemporarySupabaseAccess(repositoryRoot) {
  const access = spawnSync('supabase', ['db', 'dump', '--linked', '--dry-run'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (access.status !== 0) {
    throw new Error('Could not obtain temporary database access from the linked Supabase project. Sign in with the Supabase CLI and try again.');
  }

  const output = `${access.stdout || ''}\n${access.stderr || ''}`;
  const required = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'];
  const values = {};
  for (const name of required) {
    const match = output.match(new RegExp(`^export ${name}="([^"]*)"$`, 'm'));
    if (!match) throw new Error(`Temporary Supabase access did not provide ${name}.`);
    values[name] = match[1];
  }

  const roleLine = output.split('\n').find(line => line.includes('--role')) || '';
  const roleArgument = roleLine.slice(roleLine.indexOf('--role') + 6).trimStart().match(/^"([^"]+)"/);
  const role = roleArgument?.[1];
  if (!role || !TRUSTED_ROLES.has(role)) {
    throw new Error('Temporary Supabase access did not provide an allow-listed database role.');
  }

  const connection = new URL('postgresql://placeholder/');
  connection.hostname = values.PGHOST;
  connection.port = values.PGPORT;
  connection.username = values.PGUSER;
  connection.password = values.PGPASSWORD;
  connection.pathname = `/${values.PGDATABASE}`;
  connection.searchParams.set('sslmode', 'require');
  connection.searchParams.set('uselibpqcompat', 'true');

  return {
    connectionString: connection.toString(),
    role,
    pgEnvironment: {
      PGHOST: values.PGHOST,
      PGPORT: values.PGPORT,
      PGUSER: values.PGUSER,
      PGPASSWORD: values.PGPASSWORD,
      PGDATABASE: values.PGDATABASE,
      PGSSLMODE: 'require',
      PGCONNECT_TIMEOUT: '30',
    },
  };
}
