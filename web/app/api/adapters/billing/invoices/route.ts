import { NextResponse } from 'next/server';
import { exec } from 'child_process';

export async function GET(): Promise<Response> {
  return new Promise<Response>((resolve) => {
    const rootDir = process.cwd().replace(/[\\/]web$/, '');
    exec(
      'python -c "from adapters.billing.db import get_invoices; import json; print(json.dumps(get_invoices()))"',
      { cwd: rootDir },
      (err, stdout) => {
        if (err) {
          resolve(NextResponse.json({ invoices: [], error: err.message }));
        } else {
          try {
            const invoices = JSON.parse(stdout.trim());
            resolve(NextResponse.json({ invoices }));
          } catch {
            resolve(NextResponse.json({ invoices: [] }));
          }
        }
      }
    );
  });
}

export async function POST(): Promise<Response> {
  return new Promise<Response>((resolve) => {
    const rootDir = process.cwd().replace(/[\\/]web$/, '');
    exec(
      'python -m adapters.billing.main --once',
      { cwd: rootDir },
      () => {
        exec(
          'python -c "from adapters.billing.db import get_invoices; import json; print(json.dumps(get_invoices()))"',
          { cwd: rootDir },
          (err, stdout) => {
            if (err) {
              resolve(NextResponse.json({ invoices: [], error: err.message }));
            } else {
              try {
                const invoices = JSON.parse(stdout.trim());
                resolve(NextResponse.json({ invoices }));
              } catch {
                resolve(NextResponse.json({ invoices: [] }));
              }
            }
          }
        );
      }
    );
  });
}
