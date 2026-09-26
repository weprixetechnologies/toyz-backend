const fs = require('fs');
const path = require('path');

const controllerPath = path.join(__dirname, 'src/modules/reviews/reviewsController.js');
let content = fs.readFileSync(controllerPath, 'utf8');

const newFunc = `
async function listUserReviews(req, res, next) {
  try {
    const reviews = await query(
      \`SELECT pr.*, p.name as product_name, p.slug as product_slug, 
        (SELECT url FROM product_images WHERE product_id = p.id ORDER BY is_primary DESC LIMIT 1) as product_image
       FROM product_reviews pr
       JOIN products p ON pr.product_id = p.id
       WHERE pr.user_id = ?
       ORDER BY pr.created_at DESC\`,
      [req.user.id]
    );
    res.json({ success: true, data: { reviews } });
  } catch (error) {
    next(error);
  }
}
`;

content = content.replace('module.exports = {', newFunc + '\nmodule.exports = {\n  listUserReviews,');
fs.writeFileSync(controllerPath, content);

const routesPath = path.join(__dirname, 'src/modules/reviews/reviewsRoutes.js');
let routeContent = fs.readFileSync(routesPath, 'utf8');

routeContent = routeContent.replace(
  "// Admin Endpoints",
  "// User Endpoints\nrouter.get('/user/reviews', authMiddleware, reviewsController.listUserReviews);\n\n// Admin Endpoints"
);

fs.writeFileSync(routesPath, routeContent);
console.log('Reviews API updated.');
