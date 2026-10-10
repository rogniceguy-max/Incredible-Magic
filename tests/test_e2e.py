import asyncio
import httpx
from server.main import app

async def test_pipeline():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
        # Create task
        res = await client.post('/api/tasks', data={'title': 'Test Recon Task', 'binary_path': r'C:\Windows\System32\cmd.exe'})
        data = res.json()
        task_id = data['task_id']
        print(f"Created task: {task_id}")
        
        # Wait for agent steps
        await asyncio.sleep(4.0)
        
        # Check approvals
        appr_res = await client.get('/api/approvals')
        approvals = appr_res.json().get('approvals', [])
        print(f"Approvals found: {len(approvals)}")
        if approvals:
            appr = approvals[0]
            print(f"Pending approval: {appr['tool_name']}, Risk: {appr['risk_level']}")
            
            # Decide approve
            dec_res = await client.post(f"/api/approvals/{appr['id']}/decision", json={'decision': 'approved'})
            print(f"Decision submitted: {dec_res.json().get('success')}")
            
            await asyncio.sleep(1.0)
            task_detail = await client.get(f"/api/tasks/{task_id}")
            task_info = task_detail.json()
            print(f"Final task status: {task_info['task']['status']}")
            print(f"Total events logged: {len(task_info['events'])}")

if __name__ == '__main__':
    asyncio.run(test_pipeline())
