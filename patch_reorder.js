const fs = require('fs');
const path = require('path');

const controllerPath = path.join(__dirname, 'src/modules/homepage/homepageController.js');
let content = fs.readFileSync(controllerPath, 'utf8');

const newMethod = `
  async reorderSections(req, res, next) {
    try {
      const { updates } = req.body;
      if (Array.isArray(updates)) {
        for (const u of updates) {
          await query(\`UPDATE homepage_sections SET sort_order=? WHERE id=?\`, [u.sort_order, u.id]);
        }
      }
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
`;
content = content.replace('module.exports = new HomepageController();', newMethod + '\nmodule.exports = new HomepageController();');
fs.writeFileSync(controllerPath, content);

const routesPath = path.join(__dirname, 'src/modules/homepage/homepageRoutes.js');
let routeContent = fs.readFileSync(routesPath, 'utf8');
routeContent = routeContent.replace(
  "router.post('/admin/sections', authMiddleware, roleGuard('admin'), controller.createSection);",
  "router.put('/admin/sections/reorder', authMiddleware, roleGuard('admin'), controller.reorderSections);\nrouter.post('/admin/sections', authMiddleware, roleGuard('admin'), controller.createSection);"
);
fs.writeFileSync(routesPath, routeContent);
console.log('Backend patched.');
